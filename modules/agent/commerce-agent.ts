import type { CatalogModule } from "@/modules/catalog/catalog";
import { CartError, type CartModule } from "@/modules/cart/cart";
import type {
  CatalogProduct,
  CatalogSearch,
  CatalogSearchResult,
  ProductDetailResult,
} from "@/modules/catalog/types";
import {
  ConversationAccessError,
  type AgentMessage,
  type AgentTurn,
  type ConversationModule,
} from "./conversation";
import {
  applyProductConstraintDelta,
  createEmptyConversationContext,
  resolveIntentBrief,
  type ConversationContext,
  type IntentAnalyzer,
  type IntentBrief,
} from "./intent";
import type { AgentOutcome } from "./agent-outcome";

export interface CommerceAgent {
  respond(input: AgentMessage): Promise<AgentOutcome>;
}

export type CommerceCapabilities = {
  searchProducts?: (input: CatalogSearch) => Promise<CatalogSearchResult>;
  getProduct?: (productId: string) => Promise<ProductDetailResult>;
};

export type CommerceAgentLoopResult =
  | {
      status: "COMPLETED";
      message: string;
      productIds: string[];
    }
  | {
      status: "NEEDS_INPUT";
      message: string;
      question: string;
      missingInformation: string[];
    }
  | { status: "LIMIT_REACHED" };

export type CommerceAgentLoopInput = {
  message: string;
  intentBrief: IntentBrief;
  capabilities: CommerceCapabilities;
  limits: CommerceAgentLimits;
  signal: AbortSignal;
};

export interface CommerceAgentLoop {
  run(input: CommerceAgentLoopInput): Promise<CommerceAgentLoopResult>;
}

export type CommerceAgentLimits = {
  maxSteps: number;
  timeoutMs: number;
  maxOutputTokens: number;
  maxToolProducts: number;
};

export const MAX_COMMERCE_AGENT_TOOL_PRODUCTS = 8;

type CommerceAgentOptions = {
  agentLoop: CommerceAgentLoop;
  cart?: CartModule;
  limits?: CommerceAgentLimits;
};

const COMMERCE_AGENT_LIMITS: CommerceAgentLimits = {
  maxSteps: 5,
  timeoutMs: 15_000,
  maxOutputTokens: 2_000,
  maxToolProducts: MAX_COMMERCE_AGENT_TOOL_PRODUCTS,
};

export function createCommerceAgent(
  catalog: CatalogModule,
  analyzer: IntentAnalyzer,
  conversation: ConversationModule,
  options: CommerceAgentOptions,
): CommerceAgent {
  return {
    async respond(input): Promise<AgentOutcome> {
      let turn: AgentTurn;
      try {
        turn = await conversation.startTurn(input);
      } catch (error) {
        if (error instanceof ConversationAccessError) throw error;
        return {
          status: "TEMPORARILY_UNAVAILABLE",
          ...(input.conversationId
            ? { conversationId: input.conversationId }
            : {}),
          message:
            "I couldn't start that conversation right now. Please try again.",
          retryable: true,
          products: [],
        };
      }
      if (turn.duplicateOutcome) return turn.duplicateOutcome;
      let intentBrief!: IntentBrief;
      let resolvedContext!: ConversationContext;
      let currentContext = turn.context ?? createEmptyConversationContext();
      for (let attempt = 0; attempt < 2; attempt += 1) {
        let nextContext: ConversationContext;
        try {
          const analysis = await analyzer.analyze({
            context: currentContext,
            message: input.message,
          });
          nextContext = applyProductConstraintDelta(
            currentContext,
            analysis.constraintDelta,
          );
          intentBrief = resolveIntentBrief(analysis, nextContext);
          resolvedContext = nextContext;
        } catch {
          const outcome: AgentOutcome = {
            status: "TEMPORARILY_UNAVAILABLE",
            conversationId: turn.conversationId,
            message:
              "I couldn't understand that request right now. Please try again.",
            retryable: true,
            products: [],
          };
          return completeTurn(turn, outcome);
        }

        try {
          const saved = await turn.recordIntentBrief(intentBrief, nextContext);
          if (saved !== false) break;
          if (attempt === 1 || !turn.reloadContext) {
            return completeTurn(
              turn,
              contextConflictOutcome(turn.conversationId),
            );
          }
          currentContext = await turn.reloadContext();
        } catch {
          return completeTurn(turn, {
            status: "TEMPORARILY_UNAVAILABLE",
            conversationId: turn.conversationId,
            message:
              "I couldn't save that request right now. Please try again.",
            retryable: true,
            intentBrief,
            products: [],
          });
        }
      }
      const hasUnstructuredClear =
        intentBrief.requestedEffects.includes("CLEAR_CART") &&
        !intentBrief.requestedCartMutations?.length;
      if (hasUnstructuredClear && intentBrief.requestedEffects.some((effect) =>
        ["ADD_TO_CART", "REMOVE_FROM_CART", "CHANGE_CART_QUANTITY"].includes(effect)
      )) {
        return needsInputWithCurrentCart({
          turn,
          cart: options.cart,
          intentBrief,
          message: "Clearing the Cart cannot be combined with another Cart Mutation.",
          question: "Would you like me to clear the Cart or apply the other changes?",
          missingInformation: ["One unambiguous Cart Mutation batch"],
        });
      }
      const requestedCartMutations = intentBrief.requestedCartMutations ??
        (hasUnstructuredClear ? [{ type: "CLEAR" as const }] : undefined);
      if (requestedCartMutations?.length) {
        const mutationEffects = new Set<string>(requestedCartMutations.map((mutation) => {
          switch (mutation.type) {
            case "ADD": return "ADD_TO_CART";
            case "REMOVE": return "REMOVE_FROM_CART";
            case "CHANGE_QUANTITY": return "CHANGE_CART_QUANTITY";
            case "CLEAR": return "CLEAR_CART";
          }
        }));
        const requestedMutationEffects = intentBrief.requestedEffects.filter(
          (effect) => [
            "ADD_TO_CART",
            "REMOVE_FROM_CART",
            "CHANGE_CART_QUANTITY",
            "CLEAR_CART",
          ].includes(effect),
        );
        const hasLegacyMutationDetails =
          intentBrief.referencedProductIds !== undefined ||
          intentBrief.requestedQuantity !== undefined ||
          intentBrief.requestedAdditions !== undefined ||
          intentBrief.requestedCartItemReference !== undefined ||
          intentBrief.requestedCartQuantityChange !== undefined ||
          intentBrief.hasMultipleCartQuantityChanges === true ||
          intentBrief.hasConflictingCartRequest === true;
        if (
          hasLegacyMutationDetails ||
          requestedMutationEffects.length !== mutationEffects.size ||
          requestedMutationEffects.some((effect) => !mutationEffects.has(effect))
        ) {
          return needsInputWithCurrentCart({
            turn,
            cart: options.cart,
            intentBrief,
            message:
              "The requested Cart Mutations cannot be combined because their details conflict.",
            question: "Which exact Cart Mutations would you like me to apply together?",
            missingInformation: ["Consistent Cart Mutations"],
          });
        }
        if (intentBrief.hasUnresolvedProductReferences) {
          return needsInputWithCurrentCart({
            turn,
            cart: options.cart,
            intentBrief,
            message:
              "One requested Product is no longer in the latest Recommendation Set.",
            question: "Which current Products should I use for these Cart Mutations?",
            missingInformation: ["Current Product references"],
          });
        }
        try {
          if (!options.cart?.applyMutations) {
            throw new Error("Cart Mutation batch capability unavailable");
          }
          const additions = requestedCartMutations.filter(
            (mutation) => mutation.type === "ADD",
          );
          const productResults = await Promise.all(
            additions.map((mutation) => catalog.getProduct(mutation.productId)),
          );
          const productsById = new Map(
            productResults.map((result, index) => {
              if (!result.ok) {
                throw new CartError(
                  `${additions[index].productId} is not available.`,
                );
              }
              return [result.value.id, result.value] as const;
            }),
          );
          const mutations = requestedCartMutations.map((mutation) =>
            mutation.type === "ADD"
              ? {
                  type: "ADD" as const,
                  product: productsById.get(mutation.productId)!,
                  quantity: mutation.quantity,
                }
              : mutation,
          );
          let completedOutcome: AgentOutcome | undefined;
          await options.cart.applyMutations(
            mutations,
            async (updatedCart, transaction) => {
              const outcome: AgentOutcome = {
                status: "COMPLETED",
                conversationId: turn.conversationId,
                message:
                  updatedCart.items.length === 0
                    ? "Your Cart is empty."
                    : "Updated your Cart.",
                intentBrief,
                products: [],
                cart: updatedCart,
              };
              await turn.complete(outcome.message, outcome, transaction);
              completedOutcome = outcome;
            },
          );
          if (completedOutcome) return completedOutcome;
          throw new Error("Atomic Cart completion was not invoked");
        } catch (error) {
          if (error instanceof CartError) {
            return needsInputWithCurrentCart({
              turn,
              cart: options.cart,
              intentBrief,
              message: error.message,
              question: "How should I correct these Cart Mutations?",
              missingInformation: ["Valid Cart Mutations"],
            });
          }
          return completeTurn(turn, {
            status: "TEMPORARILY_UNAVAILABLE",
            conversationId: turn.conversationId,
            message: "I couldn't update your Cart right now. Please try again.",
            retryable: true,
            intentBrief,
            products: [],
          });
        }
      }
      if (intentBrief.requestedEffects.includes("INSPECT_CART")) {
        try {
          if (!options.cart) throw new Error("Cart capability unavailable");
          const cart = await options.cart.inspect();
          return completeTurn(turn, {
            status: "COMPLETED",
            conversationId: turn.conversationId,
            message:
              cart.items.length > 0
                ? "Here’s what’s in your Cart."
                : "Your Cart is empty.",
            intentBrief,
            products: [],
            cart,
          });
        } catch {
          return completeTurn(turn, {
            status: "TEMPORARILY_UNAVAILABLE",
            conversationId: turn.conversationId,
            message: "I couldn't read your Cart right now. Please try again.",
            retryable: true,
            intentBrief,
            products: [],
          });
        }
      }
      if (intentBrief.requestedEffects.includes("CHANGE_CART_QUANTITY")) {
        const reference = intentBrief.requestedCartItemReference?.trim();
        const change = intentBrief.requestedCartQuantityChange;
        if (
          intentBrief.hasMultipleCartQuantityChanges ||
          intentBrief.requestedEffects.some((effect) =>
            ["ADD_TO_CART", "REMOVE_FROM_CART"].includes(effect),
          )
        ) {
          return needsInputWithCurrentCart({
            turn,
            cart: options.cart,
            intentBrief,
            message:
              "I couldn't safely apply multiple kinds of Cart Mutation together.",
            question: "Which Cart Mutation would you like me to apply first?",
            missingInformation: ["One Cart Mutation kind"],
          });
        }
        if (intentBrief.requestedQuantity === 0 ||
          (change?.mode === "EXACT" && change.quantity === 0)) {
          return needsInputWithCurrentCart({
            turn,
            cart: options.cart,
            intentBrief,
            message:
              "Cart Item quantity must be between 1 and 10. Remove the Cart Item explicitly instead.",
            question: "Would you like to remove that Cart Item?",
            missingInformation: ["Explicit Cart Item Removal"],
          });
        }
        if (!change) {
          return needsInputWithCurrentCart({
            turn,
            cart: options.cart,
            intentBrief,
            message: "I need one specific Cart Item and a clear quantity change.",
            question: "Which Cart Item and quantity would you like?",
            missingInformation: ["Unambiguous Cart Item", "Clear quantity change"],
          });
        }
        try {
          if (!options.cart?.changeItemQuantity) {
            throw new Error("Cart Quantity Change capability unavailable");
          }
          let completedOutcome: AgentOutcome | undefined;
          await options.cart.changeItemQuantity(
            reference,
            change,
            async (updatedCart, transaction) => {
              const item = updatedCart.items.find(
                ({ productName }) =>
                  reference !== undefined &&
                  productName.trim().toLocaleLowerCase() ===
                    reference.toLocaleLowerCase(),
              ) ?? (reference === undefined ? updatedCart.items[0] : undefined);
              const outcome: AgentOutcome = {
                status: "COMPLETED",
                conversationId: turn.conversationId,
                message: cartQuantityChangeMessage(
                  item?.productName ?? reference ?? "Cart Item",
                  item?.quantity ?? change.quantity,
                  updatedCart,
                ),
                intentBrief,
                products: [],
                cart: updatedCart,
              };
              await turn.complete(outcome.message, outcome, transaction);
              completedOutcome = outcome;
            },
          );
          if (completedOutcome) return completedOutcome;
          throw new Error("Atomic Cart completion was not invoked");
        } catch (error) {
          if (error instanceof CartError) {
            return needsInputWithCurrentCart({
              turn,
              cart: options.cart,
              intentBrief,
              message: error.message,
              question: "Which Cart Item and quantity would you like?",
              missingInformation: ["Valid Cart Quantity Change"],
            });
          }
          return completeTurn(turn, {
            status: "TEMPORARILY_UNAVAILABLE",
            conversationId: turn.conversationId,
            message: "I couldn't update your Cart right now. Please try again.",
            retryable: true,
            intentBrief,
            products: [],
          });
        }
      }
      if (intentBrief.requestedEffects.includes("REMOVE_FROM_CART")) {
        const reference = intentBrief.requestedCartItemReference?.trim();
        if (!reference) {
          return needsInputWithCurrentCart({
            turn,
            cart: options.cart,
            intentBrief,
            message: "I need one specific Cart Item to remove.",
            question: "Which Cart Item would you like to remove?",
            missingInformation: ["Unambiguous Cart Item"],
          });
        }
        try {
          if (!options.cart?.removeItem) {
            throw new Error("Cart Item Removal capability unavailable");
          }
          let completedOutcome: AgentOutcome | undefined;
          await options.cart.removeItem(reference, async (updatedCart, transaction) => {
            const outcome: AgentOutcome = {
              status: "COMPLETED",
              conversationId: turn.conversationId,
              message:
                updatedCart.items.length === 0
                  ? `Removed ${reference} from your Cart. Your Cart is now empty.`
                  : `Removed ${reference} from your Cart.`,
              intentBrief,
              products: [],
              cart: updatedCart,
            };
            await turn.complete(outcome.message, outcome, transaction);
            completedOutcome = outcome;
          });
          if (completedOutcome) return completedOutcome;
          throw new Error("Atomic Cart completion was not invoked");
        } catch (error) {
          if (error instanceof CartError) {
            return needsInputWithCurrentCart({
              turn,
              cart: options.cart,
              intentBrief,
              message: error.message,
              question: "Which Cart Item would you like to remove?",
              missingInformation: ["Unambiguous Cart Item"],
            });
          }
          return completeTurn(turn, {
            status: "TEMPORARILY_UNAVAILABLE",
            conversationId: turn.conversationId,
            message: "I couldn't update your Cart right now. Please try again.",
            retryable: true,
            intentBrief,
            products: [],
          });
        }
      }
      if (intentBrief.requestedEffects.includes("ADD_TO_CART")) {
        const requestedAdditions = intentBrief.requestedAdditions;
        const referencedProductIds =
          requestedAdditions?.map(({ productId }) => productId) ??
          intentBrief.referencedProductIds ??
          [];
        if (intentBrief.hasUnresolvedProductReferences) {
          return needsInputWithCurrentCart({
            turn,
            cart: options.cart,
            intentBrief,
            message:
              "One requested Product is no longer in the latest Recommendation Set.",
            question:
              "Which current recommended Products would you like to add?",
            missingInformation: ["Current Product references"],
          });
        }
        if (intentBrief.hasConflictingCartRequest) {
          return needsInputWithCurrentCart({
            turn,
            cart: options.cart,
            intentBrief,
            message: "The requested Products and quantities do not match.",
            question: "Which Products and quantities would you like to add?",
            missingInformation: ["Consistent Product quantities"],
          });
        }
        let directlyMatchedProduct: CatalogProduct | undefined;
        let directlyMatchedProducts: CatalogProduct[] = [];
        const resolvesDirectRequest =
          referencedProductIds.length === 0 &&
          intentBrief.requestedEffects.includes("DISCOVER_PRODUCTS");
        if (resolvesDirectRequest) {
          try {
            const result = await catalog.search({
              ...activeProductConstraints(intentBrief.constraints),
              ...(Object.keys(intentBrief.constraints.attributes).length > 0
                ? { attributes: intentBrief.constraints.attributes }
                : {}),
              limit: 2,
            });
            directlyMatchedProducts = result.products;
            if (
              result.products.length === 1 &&
              result.nextCursor === undefined
            ) {
              directlyMatchedProduct = result.products[0];
            }
          } catch {
            return completeTurn(turn, {
              status: "TEMPORARILY_UNAVAILABLE",
              conversationId: turn.conversationId,
              message:
                "I couldn't search the Catalog right now. Please try again.",
              retryable: true,
              intentBrief,
              products: [],
            });
          }
        }
        if (directlyMatchedProducts.length > 0 && !directlyMatchedProduct) {
          try {
            const saved = await turn.recordRecommendationSet?.(
              directlyMatchedProducts,
              resolvedContext,
            );
            if (saved === false) {
              return completeTurn(
                turn,
                contextConflictOutcome(turn.conversationId),
              );
            }
          } catch {
            return completeTurn(turn, {
              status: "TEMPORARILY_UNAVAILABLE",
              conversationId: turn.conversationId,
              message:
                "I couldn't save those Recommendations right now. Please try again.",
              retryable: true,
              intentBrief,
              products: [],
            });
          }
          return needsInputWithCurrentCart({
            turn,
            cart: options.cart,
            intentBrief,
            message: "I found multiple Products matching that Cart request.",
            question: "Which Product would you like to add?",
            missingInformation: ["Unambiguous Product"],
            products: directlyMatchedProducts,
          });
        }
        if (resolvesDirectRequest && directlyMatchedProducts.length === 0) {
          try {
            if (!options.cart) throw new Error("Cart capability unavailable");
            const cart = await options.cart.inspect();
            return completeTurn(turn, {
              status: "COMPLETED",
              conversationId: turn.conversationId,
              message: "I couldn't find a Product matching that Cart request.",
              intentBrief,
              products: [],
              cart,
            });
          } catch {
            return completeTurn(turn, {
              status: "TEMPORARILY_UNAVAILABLE",
              conversationId: turn.conversationId,
              message: "I couldn't read your Cart right now. Please try again.",
              retryable: true,
              intentBrief,
              products: [],
            });
          }
        }
        if (!directlyMatchedProduct && referencedProductIds.length === 0) {
          return needsInputWithCurrentCart({
            turn,
            cart: options.cart,
            intentBrief,
            message:
              "I need one specific Product from the latest Recommendations.",
            question: "Which recommended Product would you like to add?",
            missingInformation: ["Unambiguous Product"],
          });
        }
        const quantity = intentBrief.requestedQuantity ?? 1;
        const quantities = requestedAdditions?.map((item) => item.quantity) ?? [
          quantity,
        ];
        const invalidQuantityIndex = quantities.findIndex(
          (requested) =>
            !Number.isInteger(requested) || requested < 1 || requested > 10,
        );
        if (invalidQuantityIndex !== -1) {
          const invalidProductId = referencedProductIds[invalidQuantityIndex];
          const invalidProductName =
            directlyMatchedProduct?.name ??
            resolvedContext.latestRecommendationSet.find(
              ({ productId }) => productId === invalidProductId,
            )?.name ??
            "Product";
          return needsInputWithCurrentCart({
            turn,
            cart: options.cart,
            intentBrief,
            message: `${invalidProductName} quantity must be between 1 and 10.`,
            question: `How many units of ${invalidProductName} would you like, from 1 to 10?`,
            missingInformation: ["Valid Cart quantity"],
          });
        }
        try {
          if (!options.cart) throw new Error("Cart capability unavailable");
          const productResults = directlyMatchedProduct
            ? [{ ok: true as const, value: directlyMatchedProduct }]
            : await Promise.all(
                referencedProductIds.map((productId) =>
                  catalog.getProduct(productId),
                ),
              );
          const selectedProducts = productResults.map(
            (productResult, index) => {
              if (!productResult.ok) {
                const productId = referencedProductIds[index];
                const productName =
                  resolvedContext.latestRecommendationSet.find(
                    (reference) => reference.productId === productId,
                  )?.name ?? "Product";
                throw new CartError(`${productName} is not available.`);
              }
              return productResult.value;
            },
          );
          const additions = selectedProducts.map((product) => ({
            product,
            quantity:
              requestedAdditions?.find((item) => item.productId === product.id)
                ?.quantity ?? quantity,
          }));
          let completedOutcome: AgentOutcome | undefined;
          const completeAddition: Parameters<CartModule["addItem"]>[2] = async (
            updatedCart,
            transaction,
          ) => {
            const outcome: AgentOutcome = {
              status: "COMPLETED",
              conversationId: turn.conversationId,
              message: cartAdditionsMessage(additions, updatedCart),
              intentBrief,
              products: [],
              cart: updatedCart,
            };
            await turn.complete(outcome.message, outcome, transaction);
            completedOutcome = outcome;
          };
          if (additions.length === 1) {
            await options.cart.addItem(
              additions[0].product,
              additions[0].quantity,
              completeAddition,
            );
          } else {
            await options.cart.addItems(additions, completeAddition);
          }
          if (completedOutcome) return completedOutcome;
          throw new Error("Atomic Cart completion was not invoked");
        } catch (error) {
          if (error instanceof CartError) {
            return needsInputWithCurrentCart({
              turn,
              cart: options.cart,
              intentBrief,
              message: error.message,
              question:
                "Would you like to choose a different Product or quantity?",
              missingInformation: ["Valid Cart addition"],
            });
          }
          return completeTurn(turn, {
            status: "TEMPORARILY_UNAVAILABLE",
            conversationId: turn.conversationId,
            message: "I couldn't update your Cart right now. Please try again.",
            retryable: true,
            intentBrief,
            products: [],
          });
        }
      }
      let loopResult: CommerceAgentLoopResult;
      const observedProducts = new Map<string, CatalogProduct>();
      const limits = boundedAgentLimits(options.limits);
      const controller = new AbortController();
      const capabilities = resolveCapabilities({
        catalog,
        intentBrief,
        limits,
        signal: controller.signal,
        observedProducts,
      });

      try {
        loopResult = await runBoundedAgentLoop(
          options.agentLoop,
          {
            message: input.message,
            intentBrief,
            capabilities,
            limits,
            signal: controller.signal,
          },
          controller,
        );
      } catch {
        if (controller.signal.aborted) {
          return completeTurn(
            turn,
            limitOutcome(
              turn.conversationId,
              intentBrief,
              observedProducts,
              limits.maxToolProducts,
            ),
          );
        }
        return completeTurn(turn, {
          status: "TEMPORARILY_UNAVAILABLE",
          conversationId: turn.conversationId,
          message:
            "Product discovery is temporarily unavailable. Please try again.",
          retryable: true,
          intentBrief,
          products: [],
        });
      }

      if (loopResult.status === "LIMIT_REACHED") {
        return completeTurn(
          turn,
          limitOutcome(
            turn.conversationId,
            intentBrief,
            observedProducts,
            limits.maxToolProducts,
          ),
        );
      }

      if (loopResult.status === "NEEDS_INPUT") {
        return completeTurn(turn, {
          ...loopResult,
          conversationId: turn.conversationId,
          intentBrief,
          products: [],
        });
      }

      if (
        loopResult.productIds.some(
          (productId) => !observedProducts.has(productId),
        )
      ) {
        return completeTurn(
          turn,
          limitOutcome(
            turn.conversationId,
            intentBrief,
            observedProducts,
            limits.maxToolProducts,
          ),
        );
      }

      const products = loopResult.productIds.flatMap((productId) => {
        const product = observedProducts.get(productId);
        return product ? [product] : [];
      });
      try {
        await turn.recordRecommendationSet?.(products, resolvedContext);
      } catch {
        return completeTurn(turn, {
          status: "TEMPORARILY_UNAVAILABLE",
          conversationId: turn.conversationId,
          message:
            "I couldn't save those Recommendations right now. Please try again.",
          retryable: true,
          intentBrief,
          products: [],
        });
      }
      return completeTurn(turn, {
        status: "COMPLETED",
        conversationId: turn.conversationId,
        message: loopResult.message,
        intentBrief,
        products,
      });
    },
  };
}

function contextConflictOutcome(conversationId: string): AgentOutcome {
  return {
    status: "TEMPORARILY_UNAVAILABLE",
    conversationId,
    message: "That conversation changed. Please retry your request.",
    retryable: true,
    products: [],
  };
}

function cartAdditionMessage(
  quantity: number,
  productName: string,
  cart: Awaited<ReturnType<CartModule["addItem"]>>,
): string {
  const confirmation = `Added ${quantity} × ${productName} to your Cart.`;
  const priceChange = cart.priceChanges?.[0];
  if (!priceChange) return confirmation;
  return `${confirmation} Its Cart Price ${priceChange.direction.toLowerCase()} from ${formatCartPrice(priceChange.previousCartPriceMinor, cart.currency)} to ${formatCartPrice(priceChange.currentCartPriceMinor, cart.currency)}.`;
}

function cartQuantityChangeMessage(
  productName: string,
  quantity: number,
  cart: Awaited<ReturnType<CartModule["addItem"]>>,
): string {
  const confirmation = `Changed ${productName} quantity to ${quantity}.`;
  const priceChange = cart.priceChanges?.[0];
  if (!priceChange) return confirmation;
  return `${confirmation} Its Cart Price ${priceChange.direction.toLowerCase()} from ${formatCartPrice(priceChange.previousCartPriceMinor, cart.currency)} to ${formatCartPrice(priceChange.currentCartPriceMinor, cart.currency)}.`;
}

function cartAdditionsMessage(
  additions: Array<{ product: CatalogProduct; quantity: number }>,
  cart: Awaited<ReturnType<CartModule["addItem"]>>,
): string {
  if (additions.length === 1) {
    const [{ product, quantity }] = additions;
    return cartAdditionMessage(quantity, product.name, cart);
  }
  const selections = additions.map(
    ({ product, quantity }) => `${quantity} × ${product.name}`,
  );
  const confirmation = `Added ${selections.slice(0, -1).join(", ")} and ${selections.at(-1)} to your Cart.`;
  if (!cart.priceChanges?.length) return confirmation;
  const productNames = new Map(
    additions.map(({ product }) => [product.id, product.name]),
  );
  const changes = cart.priceChanges.map((change) => {
    return `${productNames.get(change.productId) ?? "Product"} ${change.direction.toLowerCase()} from ${formatCartPrice(change.previousCartPriceMinor, cart.currency)} to ${formatCartPrice(change.currentCartPriceMinor, cart.currency)}`;
  });
  return `${confirmation} Cart Price changes: ${changes.join("; ")}.`;
}

function formatCartPrice(priceMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
  }).format(priceMinor / 100);
}

async function needsInputWithCurrentCart({
  turn,
  cart,
  intentBrief,
  message,
  question,
  missingInformation,
  products,
}: {
  turn: AgentTurn;
  cart: CartModule | undefined;
  intentBrief: IntentBrief;
  message: string;
  question: string;
  missingInformation: string[];
  products?: CatalogProduct[];
}): Promise<AgentOutcome> {
  try {
    if (!cart) throw new Error("Cart capability unavailable");
    const currentCart = await cart.inspect();
    return completeTurn(turn, {
      status: "NEEDS_INPUT",
      conversationId: turn.conversationId,
      message,
      question,
      missingInformation,
      intentBrief,
      products: products ?? [],
      cart: currentCart,
    });
  } catch {
    return completeTurn(turn, {
      status: "TEMPORARILY_UNAVAILABLE",
      conversationId: turn.conversationId,
      message: "I couldn't read your Cart right now. Please try again.",
      retryable: true,
      intentBrief,
      products: [],
    });
  }
}

function resolveCapabilities({
  catalog,
  intentBrief,
  limits,
  signal,
  observedProducts,
}: {
  catalog: CatalogModule;
  intentBrief: IntentBrief;
  limits: CommerceAgentLimits;
  signal: AbortSignal;
  observedProducts: Map<string, CatalogProduct>;
}): CommerceCapabilities {
  const canDiscover =
    intentBrief.requestedEffects.includes("DISCOVER_PRODUCTS");
  const referencedProductIds = new Set(intentBrief.referencedProductIds ?? []);
  if (!canDiscover && referencedProductIds.size === 0) return {};

  const assertLoopActive = () => {
    if (signal.aborted) {
      throw new Error("The Commerce Agent run has ended.");
    }
  };

  return {
    ...(canDiscover
      ? {
          async searchProducts(search: CatalogSearch) {
            assertLoopActive();
            const result = await catalog.search({
              ...search,
              ...activeProductConstraints(intentBrief.constraints),
              ...(Object.keys(intentBrief.constraints.attributes).length > 0
                ? {
                    attributes: {
                      ...search.attributes,
                      ...intentBrief.constraints.attributes,
                    },
                  }
                : {}),
              limit: Math.max(
                1,
                Math.min(search.limit, limits.maxToolProducts),
              ),
            });
            assertLoopActive();
            const boundedProducts = result.products.slice(
              0,
              limits.maxToolProducts,
            );
            for (const product of boundedProducts) {
              observedProducts.set(product.id, product);
            }
            return { ...result, products: boundedProducts };
          },
        }
      : {}),
    async getProduct(productId) {
      assertLoopActive();
      if (!canDiscover && !referencedProductIds.has(productId)) {
        throw new Error("Only referenced Products can be inspected.");
      }
      const result = await catalog.getProduct(productId);
      assertLoopActive();
      if (result.ok) observedProducts.set(result.value.id, result.value);
      return result;
    },
  };
}

function activeProductConstraints(
  constraints: IntentBrief["constraints"],
): Omit<CatalogSearch, "limit"> {
  return {
    ...(constraints.productTypes.length > 0
      ? { productTypes: constraints.productTypes }
      : {}),
    ...(constraints.useCases.length > 0
      ? { useCases: constraints.useCases }
      : {}),
    ...(constraints.features.length > 0
      ? { features: constraints.features }
      : {}),
    ...(constraints.category === null
      ? {}
      : { category: constraints.category }),
    ...(constraints.minPriceMinor === null
      ? {}
      : { minPriceMinor: constraints.minPriceMinor }),
    ...(constraints.maxPriceMinor === null
      ? {}
      : { maxPriceMinor: constraints.maxPriceMinor }),
    ...(constraints.size === null ? {} : { size: constraints.size }),
    inStockOnly: constraints.inStockOnly,
  };
}

async function runBoundedAgentLoop(
  agentLoop: CommerceAgentLoop,
  input: CommerceAgentLoopInput,
  controller: AbortController,
): Promise<CommerceAgentLoopResult> {
  let rejectTimeout: (reason: Error) => void = () => {};
  const timedOut = new Promise<never>((_resolve, reject) => {
    rejectTimeout = reject;
  });
  const timeout = setTimeout(() => {
    controller.abort();
    rejectTimeout(new Error("The Commerce Agent timed out."));
  }, input.limits.timeoutMs);
  timeout.unref?.();

  try {
    return await Promise.race([agentLoop.run(input), timedOut]);
  } finally {
    clearTimeout(timeout);
  }
}

function boundedAgentLimits(
  requested: CommerceAgentLimits | undefined,
): CommerceAgentLimits {
  if (!requested) return COMMERCE_AGENT_LIMITS;

  return {
    maxSteps: positiveCeiling(
      requested.maxSteps,
      COMMERCE_AGENT_LIMITS.maxSteps,
    ),
    timeoutMs: positiveCeiling(
      requested.timeoutMs,
      COMMERCE_AGENT_LIMITS.timeoutMs,
    ),
    maxOutputTokens: positiveCeiling(
      requested.maxOutputTokens,
      COMMERCE_AGENT_LIMITS.maxOutputTokens,
    ),
    maxToolProducts: positiveCeiling(
      requested.maxToolProducts,
      COMMERCE_AGENT_LIMITS.maxToolProducts,
    ),
  };
}

function positiveCeiling(requested: number, ceiling: number): number {
  if (!Number.isFinite(requested)) return ceiling;
  return Math.max(1, Math.min(Math.floor(requested), ceiling));
}

function limitOutcome(
  conversationId: string,
  intentBrief: IntentBrief,
  observedProducts: Map<string, CatalogProduct>,
  maxProducts: number,
): AgentOutcome {
  const products = [...observedProducts.values()].slice(0, maxProducts);
  if (products.length > 0) {
    return {
      status: "COMPLETED",
      conversationId,
      message: `I found ${products.length} ${products.length === 1 ? "Product" : "Products"} before the search reached its limit.`,
      intentBrief,
      products,
    };
  }

  const question = "Could you narrow the Product type or try the search again?";
  return {
    status: "NEEDS_INPUT",
    conversationId,
    message: question,
    question,
    missingInformation:
      intentBrief.missingInformation.length > 0
        ? intentBrief.missingInformation
        : ["Product preferences"],
    intentBrief,
    products: [],
  };
}

async function completeTurn(
  turn: AgentTurn,
  outcome: AgentOutcome,
): Promise<AgentOutcome> {
  try {
    await turn.complete(outcome.message, outcome);
    return outcome;
  } catch {
    return {
      status: "TEMPORARILY_UNAVAILABLE",
      conversationId: turn.conversationId,
      message: "I couldn't save that response right now. Please try again.",
      retryable: true,
      ...(outcome.intentBrief ? { intentBrief: outcome.intentBrief } : {}),
      products: [],
    };
  }
}
