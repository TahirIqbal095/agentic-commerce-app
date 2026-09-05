import { randomUUID } from "node:crypto";
import type { ProductCatalog } from "@/modules/catalog/catalog";
import type { CartInspection } from "@/modules/cart/cart-inspection";
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
  IntentAnalysisTimeoutError,
  resolveIntentBrief,
  type ConversationContext,
  type IntentAnalyzer,
  type IntentBrief,
} from "./intent";
import type { AgentOutcome } from "./agent-outcome";
import type { CheckoutPreparation } from "@/modules/checkout/checkout-proposal";

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
  /** Read-only Cart capability; absent when the Cart cannot be inspected. */
  cartInspection?: CartInspection;
  /**
   * Prepares a Checkout Proposal deterministically.
   *
   * It is the same authority the Cart's Check out control uses, so
   * conversational checkout intent and the explicit control converge on one
   * orchestrator rather than on two behaviors that must be kept in agreement.
   * The capability offered here can only prepare: there is no Approval, no
   * Order creation, and no Provider Write reachable from a Conversation Turn.
   */
  checkoutPreparation?: {
    prepare(command: { commandKey: string }): Promise<CheckoutPreparation>;
  };
  limits?: CommerceAgentLimits;
};

const COMMERCE_AGENT_LIMITS: CommerceAgentLimits = {
  maxSteps: 5,
  // A healthy loop spends two model calls on a discovery Turn. Fifteen seconds
  // cut those calls off mid-answer often enough to look like a search-quality
  // problem; twenty is a budget a healthy pipeline can actually meet. See
  // docs/adr/0016-reject-a-model-answer-on-facts-coerce-it-on-form.md.
  timeoutMs: 20_000,
  maxOutputTokens: 2_000,
  maxToolProducts: MAX_COMMERCE_AGENT_TOOL_PRODUCTS,
};

/**
 * What a Customer is told when the Storefront, not their request, fell short.
 *
 * A Turn that runs out of budget has learned nothing about the Customer's
 * phrasing, so it must never imply their request was unclear. Following such
 * advice would only hit the same wall.
 *
 * These two sentences are kept apart because they claim different facts. A
 * Turn says it ran long only when its Turn Budget actually ran out; a Turn the
 * Commerce Agent failed some other way — an unavailable provider, an answer
 * that could not be trusted — was never slow, and saying so would be a second
 * untruth told in place of the first.
 */
const STOREFRONT_RAN_LONG_MESSAGE =
  "I took too long putting that answer together, so here's what the Catalog holds for you.";

const STOREFRONT_FELL_SHORT_MESSAGE =
  "I couldn't finish that answer, so here's what the Catalog holds for you.";

/** What a Customer is told when the Catalog itself holds no match. */
const NOTHING_MATCHED_MESSAGE =
  "Nothing in the Catalog matches that right now.";

/**
 * What a Customer is told when a Turn ends with nothing to show at all.
 *
 * These are the empty-handed counterparts of the two sentences above, and they
 * divide on the same fact: only a Turn whose Turn Budget actually ran out may
 * say it ran out of time.
 */
const STOREFRONT_OUT_OF_TIME_MESSAGE =
  "I couldn't finish that in time. Please try again.";

const STOREFRONT_NO_ANSWER_MESSAGE =
  "I couldn't put an answer together right now. Please try again.";

/**
 * What a Customer is told when the Catalog answers and the Agent did not.
 *
 * A Turn promises Products whenever the Catalog holds them, so an Agent that
 * finished without naming any is not the last word. The sentence claims
 * nothing about why — nothing went slow and nothing failed, the Agent simply
 * had nothing to point at.
 */
const CATALOG_HOLDS_MESSAGE = "Here's what the Catalog holds for you.";

/**
 * What the Commerce Agent says about a checkout it did not calculate.
 *
 * The words are fixed rather than generated, so the Agent can introduce a
 * proposal without ever appearing to price it, approve it, or promise an
 * outcome the authority has not decided.
 */
function checkoutMessage(checkout: CheckoutPreparation): string {
  if (checkout.status === "PREPARED") {
    return "Here's your checkout. Check the amount, then approve it yourself — I can't approve a payment for you.";
  }
  if (checkout.status === "NOT_READY") {
    return "Your Cart isn't ready for checkout yet. Here's what needs correcting.";
  }
  return "Checkout isn't available right now.";
}

export function createCommerceAgent(
  catalog: ProductCatalog,
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
        } catch (error) {
          const outcome: AgentOutcome = {
            status: "TEMPORARILY_UNAVAILABLE",
            conversationId: turn.conversationId,
            // A Turn that ran out of time learned nothing about the Customer's
            // phrasing, so it says the Storefront fell short rather than that
            // the request was hard to read.
            message:
              error instanceof IntentAnalysisTimeoutError
                ? STOREFRONT_OUT_OF_TIME_MESSAGE
                : "I couldn't understand that request right now. Please try again.",
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
      if (intentBrief.requestedEffects.includes("START_CHECKOUT")) {
        try {
          if (!options.checkoutPreparation) {
            throw new Error("Checkout is unavailable.");
          }
          const checkout = await options.checkoutPreparation.prepare({
            commandKey: randomUUID(),
          });
          return completeTurn(turn, {
            status: "COMPLETED",
            conversationId: turn.conversationId,
            message: checkoutMessage(checkout),
            intentBrief,
            products: [],
            checkout,
          });
        } catch {
          return completeTurn(turn, {
            status: "TEMPORARILY_UNAVAILABLE",
            conversationId: turn.conversationId,
            message:
              "I couldn't prepare your checkout right now. Please try again.",
            retryable: true,
            intentBrief,
            products: [],
          });
        }
      }
      if (intentBrief.requestedEffects.includes("INSPECT_CART")) {
        try {
          if (!options.cartInspection) {
            throw new Error("Cart inspection is unavailable.");
          }
          const cart = await options.cartInspection.inspectCart();
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
      if (intentBrief.requestedEffects.includes("PRESENT_ADD_CONTROLS")) {
        const referencedProductIds = intentBrief.referencedProductIds ?? [];
        if (referencedProductIds.length > 0) {
          const selectedProducts = (
            await Promise.all(
              referencedProductIds.map((productId) =>
                catalog.getProduct(productId),
              ),
            )
          ).flatMap((result) => (result.ok ? [result.value] : []));
          if (selectedProducts.length === 1) {
            return completeTurn(turn, {
              status: "COMPLETED",
              conversationId: turn.conversationId,
              message: `I can’t change your Cart. Use Add to Cart on ${selectedProducts[0].name} to add it yourself.`,
              intentBrief,
              products: selectedProducts,
            });
          }
          return completeTurn(turn, {
            status: "NEEDS_INPUT",
            conversationId: turn.conversationId,
            message:
              "I can’t change your Cart. Choose a Product, then use its Add to Cart control.",
            question: "Which Product did you mean?",
            missingInformation: ["Unambiguous Product"],
            intentBrief,
            products: selectedProducts,
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
          return completeTurn(turn, {
            status: "NEEDS_INPUT",
            conversationId: turn.conversationId,
            intentBrief,
            message:
              "I can’t change your Cart. Choose a Product, then use its Add to Cart control.",
            question: "Which Product did you mean?",
            missingInformation: ["Unambiguous Product"],
            products: directlyMatchedProducts,
          });
        }
        if (resolvesDirectRequest && directlyMatchedProducts.length === 0) {
          return completeTurn(turn, {
            status: "COMPLETED",
            conversationId: turn.conversationId,
            message: "I couldn't find a matching Product to present.",
            intentBrief,
            products: [],
          });
        }
        if (directlyMatchedProduct) {
          return completeTurn(turn, {
            status: "COMPLETED",
            conversationId: turn.conversationId,
            message: `I can’t change your Cart. Use Add to Cart on ${directlyMatchedProduct.name} to add it yourself.`,
            intentBrief,
            products: [directlyMatchedProduct],
          });
        }
        if (!directlyMatchedProduct && referencedProductIds.length === 0) {
          return completeTurn(turn, {
            status: "NEEDS_INPUT",
            conversationId: turn.conversationId,
            intentBrief,
            message:
              "I need one specific Product from the latest Recommendations.",
            question: "Which recommended Product did you mean?",
            missingInformation: ["Unambiguous Product"],
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
      const speculativeSearch = searchCatalogSpeculatively(
        catalog,
        intentBrief,
        limits,
      );
      /**
       * Answers from the Catalog when the Commerce Agent produced nothing.
       *
       * @param budgetExhausted - Whether the Turn Budget ran out, which is the
       * only ground on which the Turn may tell the Customer it ran long.
       */
      const degrade = async (budgetExhausted: boolean) =>
        completeTurnShowing(
          turn,
          fallbackOutcome({
            conversationId: turn.conversationId,
            intentBrief,
            observedProducts,
            speculativeSearch: await speculativeSearch,
            maxProducts: limits.maxToolProducts,
            budgetExhausted,
          }),
          resolvedContext,
        );

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
        return degrade(controller.signal.aborted);
      }

      if (loopResult.status === "LIMIT_REACHED") return degrade(true);

      if (loopResult.status === "NEEDS_INPUT") {
        return completeTurnShowing(
          turn,
          {
            ...loopResult,
            conversationId: turn.conversationId,
            intentBrief,
            // A Turn that genuinely needs more information still shows what it
            // already read, so the Customer can answer by looking at real
            // Products rather than from memory.
            products: boundedProducts(observedProducts, limits.maxToolProducts),
          },
          resolvedContext,
        );
      }

      if (
        loopResult.productIds.some(
          (productId) => !observedProducts.has(productId),
        )
      ) {
        return degrade(false);
      }

      const namedProducts = loopResult.productIds.flatMap((productId) => {
        const product = observedProducts.get(productId);
        return product ? [product] : [];
      });
      if (namedProducts.length === 0) {
        const catalogHolds = await speculativeSearch;
        if (catalogHolds.ok && catalogHolds.products.length > 0) {
          return completeTurnShowing(
            turn,
            {
              status: "COMPLETED",
              conversationId: turn.conversationId,
              message: CATALOG_HOLDS_MESSAGE,
              intentBrief,
              products: catalogHolds.products.slice(0, limits.maxToolProducts),
            },
            resolvedContext,
          );
        }
      }
      return completeTurnShowing(
        turn,
        {
          status: "COMPLETED",
          conversationId: turn.conversationId,
          message: loopResult.message,
          intentBrief,
          products: namedProducts,
        },
        resolvedContext,
      );
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

function resolveCapabilities({
  catalog,
  intentBrief,
  limits,
  signal,
  observedProducts,
}: {
  catalog: ProductCatalog;
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
              ...activeProductConstraints(
                intentBrief.constraints,
                search.attributes,
              ),
              limit: Math.max(
                1,
                Math.min(search.limit, limits.maxToolProducts),
              ),
            });
            assertLoopActive();
            const foundProducts = result.products.slice(
              0,
              limits.maxToolProducts,
            );
            for (const product of foundProducts) {
              observedProducts.set(product.id, product);
            }
            return { ...result, products: foundProducts };
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

/**
 * The Catalog search the Customer's active Product constraints describe.
 *
 * Every Catalog search a Turn issues is built here, including the one the
 * Commerce Agent asks for: the Agent may add to a search but never escape the
 * constraints, so its own attributes are merged underneath rather than over.
 *
 * @param constraints - The active Product constraints from the Intent Brief.
 * @param requestedAttributes - Attributes the Commerce Agent asked for, if any.
 */
function activeProductConstraints(
  constraints: IntentBrief["constraints"],
  requestedAttributes?: CatalogSearch["attributes"],
): Omit<CatalogSearch, "limit"> {
  const attributes = { ...requestedAttributes, ...constraints.attributes };
  return {
    ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
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
  // The deadline is not unref'd: it is the only thing that ends a Turn whose
  // model never answers, and it is always cleared below.
  const timeout = setTimeout(() => {
    controller.abort();
    rejectTimeout(new Error("The Commerce Agent timed out."));
  }, input.limits.timeoutMs);

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

type SpeculativeCatalogSearch =
  { ok: true; products: CatalogProduct[] } | { ok: false };

/**
 * Runs the Storefront's own deterministic Catalog search beside the Agent.
 *
 * It is dispatched with the Commerce Agent rather than lazily on timeout, so
 * at the moment the Agent runs out of budget the Products are already in hand
 * and the Customer waits roughly one Catalog query instead of an apology.
 *
 * Its Products are held apart from the Agent's observed-Product set on
 * purpose. Merging them would let the Agent name a Product it never read,
 * which is exactly the grounding guarantee this fallback exists to protect.
 *
 * @returns The Products the Catalog holds, or a failed search that answers
 * nothing — never a rejected promise.
 */
function searchCatalogSpeculatively(
  catalog: ProductCatalog,
  intentBrief: IntentBrief,
  limits: CommerceAgentLimits,
): Promise<SpeculativeCatalogSearch> {
  if (!intentBrief.requestedEffects.includes("DISCOVER_PRODUCTS")) {
    return Promise.resolve({ ok: false });
  }
  return catalog
    .search({
      ...activeProductConstraints(intentBrief.constraints),
      limit: limits.maxToolProducts,
    })
    .then(
      (result) => ({ ok: true as const, products: result.products }),
      () => ({ ok: false as const }),
    );
}

/**
 * The answer a Turn gives when the Commerce Agent produced nothing usable.
 *
 * Whatever the Catalog holds is still shown — the Products the Agent managed
 * to read, or failing that the Storefront's own deterministic search — and the
 * shortfall is attributed to the Storefront. A Catalog that genuinely matched
 * nothing says so plainly, which is a different sentence from a Storefront
 * that ran out of time, and neither is a sentence about the Customer.
 *
 * @param budgetExhausted - Whether the Turn Budget ran out. Only then may the
 * Turn say it ran long; a Commerce Agent that failed for any other reason was
 * not slow, and claiming otherwise trades one untrue sentence for another.
 */
function fallbackOutcome({
  conversationId,
  intentBrief,
  observedProducts,
  speculativeSearch,
  maxProducts,
  budgetExhausted,
}: {
  conversationId: string;
  intentBrief: IntentBrief;
  observedProducts: Map<string, CatalogProduct>;
  speculativeSearch: SpeculativeCatalogSearch;
  maxProducts: number;
  budgetExhausted: boolean;
}): AgentOutcome {
  const observed = boundedProducts(observedProducts, maxProducts);
  const products =
    observed.length > 0
      ? observed
      : speculativeSearch.ok
        ? speculativeSearch.products.slice(0, maxProducts)
        : [];

  if (products.length > 0) {
    return {
      status: "COMPLETED",
      conversationId,
      message: budgetExhausted
        ? STOREFRONT_RAN_LONG_MESSAGE
        : STOREFRONT_FELL_SHORT_MESSAGE,
      intentBrief,
      products,
    };
  }
  if (speculativeSearch.ok) {
    return {
      status: "COMPLETED",
      conversationId,
      message: NOTHING_MATCHED_MESSAGE,
      intentBrief,
      products: [],
    };
  }
  return {
    status: "TEMPORARILY_UNAVAILABLE",
    conversationId,
    message: budgetExhausted
      ? STOREFRONT_OUT_OF_TIME_MESSAGE
      : STOREFRONT_NO_ANSWER_MESSAGE,
    retryable: true,
    intentBrief,
    products: [],
  };
}

function boundedProducts(
  observedProducts: Map<string, CatalogProduct>,
  maxProducts: number,
): CatalogProduct[] {
  return [...observedProducts.values()].slice(0, maxProducts);
}

/**
 * Completes a Turn, recording whatever Products the Customer is shown.
 *
 * Anything a Customer can see is something they can refer to on their next
 * message, so a degraded or clarifying Turn records its Recommendation Set
 * exactly as a successful one does. A Turn showing no Products records
 * nothing: it learned nothing authoritative, and erasing what the Customer was
 * last shown would break the reference they are about to make.
 */
async function completeTurnShowing(
  turn: AgentTurn,
  outcome: AgentOutcome,
  context: ConversationContext,
): Promise<AgentOutcome> {
  if (outcome.products.length === 0) return completeTurn(turn, outcome);
  try {
    const saved = await turn.recordRecommendationSet?.(outcome.products, context);
    // A refused save means a concurrent Turn moved the Conversation on, so
    // these Products were never recorded. Showing them anyway would offer the
    // Customer a "the second one" that resolves against something else.
    if (saved === false) {
      return completeTurn(turn, contextConflictOutcome(turn.conversationId));
    }
  } catch {
    return completeTurn(turn, {
      status: "TEMPORARILY_UNAVAILABLE",
      conversationId: turn.conversationId,
      message:
        "I couldn't save those Recommendations right now. Please try again.",
      retryable: true,
      ...(outcome.intentBrief ? { intentBrief: outcome.intentBrief } : {}),
      products: [],
    });
  }
  return completeTurn(turn, outcome);
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
