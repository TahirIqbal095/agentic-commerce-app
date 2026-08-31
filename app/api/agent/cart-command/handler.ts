import {
  dataResponse,
  errorResponse,
  unexpectedErrorResponse,
} from "@/lib/http/responses";
import { isUuid } from "@/lib/validation";
import type {
  CompletedAgentOutcome,
  NeedsInputAgentOutcome,
} from "@/modules/agent/agent-outcome";
import {
  ConversationAccessError,
  type ConversationModule,
} from "@/modules/agent/conversation";
import {
  CartError,
  type CartModule,
  type CartQuantityChange,
  type CartView,
} from "@/modules/cart/cart";
import type { DbExecutor } from "@/db";
import type { CartControlCommand } from "@/modules/cart/cart-control-command";

type CommandModules = {
  cart: CartModule;
  conversation: ConversationModule;
};

type CommandFactory = () => Promise<CommandModules>;
type CompleteCartCommand = (
  cart: CartView,
  transaction: DbExecutor,
) => Promise<void>;

export function createPostHandler(createModules: CommandFactory) {
  return async function POST(request: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return invalidCommand("Request body must be valid JSON.");
    }

    if (typeof body !== "object" || body === null) {
      return invalidCommand("A structured Cart command is required.");
    }
    const conversationId = "conversationId" in body ? body.conversationId : undefined;
    const idempotencyKey = "idempotencyKey" in body ? body.idempotencyKey : undefined;
    const unparsedCommand = "command" in body ? body.command : undefined;
    if (typeof conversationId !== "string" || !isUuid(conversationId)) {
      return invalidCommand("conversationId must be a UUID.");
    }
    if (typeof idempotencyKey !== "string" || !isUuid(idempotencyKey)) {
      return invalidCommand("idempotencyKey must be a UUID.");
    }
    const parsedCommand = parseCommand(unparsedCommand);
    if (typeof parsedCommand === "string") return invalidCommand(parsedCommand);
    const command = parsedCommand;

    try {
      const { cart, conversation } = await createModules();
      const currentCart = await cart.inspect();
      const item = command.type === "CLEAR_CART"
        ? undefined
        : currentCart.items.find(
            ({ productId }) => productId === command.productId,
          );
      const descriptor = describeCommand(command, item?.productName);
      const turn = await conversation.startTurn({
        conversationId,
        idempotencyKey,
        message: descriptor.customerMessage,
      });
      if (turn.duplicateOutcome) return dataResponse(turn.duplicateOutcome);
      if (command.type !== "CLEAR_CART" && !item) {
        const failure = commandFailureOutcome({
          conversationId: turn.conversationId,
          constraints: turn.context!.productConstraints,
          cart: currentCart,
          message: "That Cart Item is no longer in your Cart.",
          effect: descriptor.effect,
          action: descriptor.action,
        });
        await turn.complete(failure.message, failure);
        return dataResponse(failure);
      }
      let outcome: CompletedAgentOutcome | undefined;
      let updatedCart: CartView;
      try {
        const complete = async (
          authoritativeCart: CartView,
          transaction: DbExecutor,
        ) => {
            const message = descriptor.successMessage(authoritativeCart);
            outcome = {
              status: "COMPLETED",
              conversationId: turn.conversationId,
              message,
              intentBrief: {
                goal: descriptor.goal,
                constraints: turn.context!.productConstraints,
                knownEntities: [],
                missingInformation: [],
                confidence: 1,
                requestedEffects: [descriptor.effect],
              },
              products: [],
              cart: authoritativeCart,
            };
            await turn.complete(message, outcome, transaction);
        };
        updatedCart = await descriptor.execute(cart, complete);
      } catch (error) {
        if (!(error instanceof CartError)) throw error;
        const authoritativeCart = await cart.inspect();
        const failure = commandFailureOutcome({
          conversationId: turn.conversationId,
          constraints: turn.context!.productConstraints,
          cart: authoritativeCart,
          effect: descriptor.effect,
          action: descriptor.action,
          productId: item?.productId,
          productName: item?.productName,
          message: error.message,
        });
        await turn.complete(failure.message, failure);
        return dataResponse(failure);
      }
      if (!outcome) {
        throw new Error("Cart command did not complete its Conversation Turn.");
      }
      if (outcome.cart !== updatedCart) {
        throw new Error("Cart command returned inconsistent Cart state.");
      }
      return dataResponse(outcome);
    } catch (error) {
      if (error instanceof ConversationAccessError) {
        return errorResponse(
          {
            code: "CONVERSATION_NOT_FOUND",
            message: error.message,
            details: {},
          },
          404,
        );
      }
      console.error("Cart command failed", error);
      return unexpectedErrorResponse();
    }
  };
}

function commandFailureOutcome({
  conversationId,
  constraints,
  cart,
  message,
  productId,
  productName,
  effect,
  action,
}: {
  conversationId: string;
  constraints: NeedsInputAgentOutcome["intentBrief"]["constraints"];
  cart: NeedsInputAgentOutcome["cart"];
  message: string;
  productId?: string;
  productName?: string;
  effect: NeedsInputAgentOutcome["intentBrief"]["requestedEffects"][number];
  action: "remove" | "change" | "clear";
}): NeedsInputAgentOutcome {
  return {
    status: "NEEDS_INPUT",
    conversationId,
    message,
    question: productName
      ? `Would you like to try ${action === "remove" ? "removing" : "changing"} ${productName} again?`
      : "Would you like to inspect your Cart again?",
    missingInformation: [],
    intentBrief: {
      goal: productName
        ? `${action === "remove" ? "Remove" : "Change"} ${productName} ${action === "remove" ? "from the Cart" : "quantity"}`
        : action === "clear" ? "Clear the Cart" : `${action === "remove" ? "Remove" : "Change"} a Cart Item`,
      constraints,
      knownEntities: [],
      missingInformation: [],
      confidence: 1,
      requestedEffects: [effect],
    },
    products: [],
    cart,
    ...(productId ? { cartItemError: { productId, message } } : {}),
  };
}

function parseCommand(value: unknown): CartControlCommand | string {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return "command must be a supported Cart command.";
  }
  if (value.type === "CLEAR_CART") return { type: "CLEAR_CART" };
  if (value.type === "REMOVE_CART_ITEM") {
    if (!("productId" in value) || typeof value.productId !== "string" || !isUuid(value.productId)) {
      return "command must identify one Cart Item to remove.";
    }
    return { type: value.type, productId: value.productId };
  }
  if (value.type === "CHANGE_CART_ITEM_QUANTITY") {
    if (
      !("productId" in value) ||
      typeof value.productId !== "string" ||
      !isUuid(value.productId) ||
      !("mode" in value) ||
      !["RELATIVE", "EXACT"].includes(String(value.mode)) ||
      !("quantity" in value) ||
      typeof value.quantity !== "number" ||
      !Number.isInteger(value.quantity) ||
      (value.mode === "RELATIVE" && value.quantity === 0)
    ) {
      return "command must provide one valid Cart Quantity Change.";
    }
    return {
      type: value.type,
      productId: value.productId,
      mode: value.mode as CartQuantityChange["mode"],
      quantity: value.quantity,
    };
  }
  return "command must be a supported Cart command.";
}

function describeCommand(
  command: CartControlCommand,
  productName?: string,
): {
  effect: NeedsInputAgentOutcome["intentBrief"]["requestedEffects"][number];
  action: "remove" | "change" | "clear";
  customerMessage: string;
  goal: string;
  successMessage: (cart: CartView) => string;
  execute: (cart: CartModule, complete: CompleteCartCommand) => Promise<CartView>;
} {
  switch (command.type) {
    case "REMOVE_CART_ITEM":
      return {
        effect: "REMOVE_FROM_CART",
        action: "remove",
        customerMessage: productName
          ? `Remove ${productName} from my Cart`
          : "Remove this Cart Item from my Cart",
        goal: `Remove ${productName ?? "a Cart Item"} from the Cart`,
        successMessage: () =>
          `Removed ${productName ?? "the Cart Item"} from your Cart.`,
        execute(cart, complete) {
          if (!cart.removeItemByProductId) {
            throw new Error("Cart Item Removal is unavailable.");
          }
          return cart.removeItemByProductId(command.productId, complete);
        },
      };
    case "CLEAR_CART":
      return {
        effect: "CLEAR_CART",
        action: "clear",
        customerMessage: "Clear my Cart",
        goal: "Clear the Cart",
        successMessage: () => "Cleared your Cart.",
        execute(cart, complete) {
          if (!cart.applyMutations) {
            throw new Error("Cart Mutation commands are unavailable.");
          }
          return cart.applyMutations([{ type: "CLEAR" }], complete);
        },
      };
    case "CHANGE_CART_ITEM_QUANTITY": {
      const namedProduct = productName ?? "this Cart Item";
      return {
        effect: "CHANGE_CART_QUANTITY",
        action: "change",
        customerMessage: command.mode === "RELATIVE"
          ? `${command.quantity > 0 ? "Increase" : "Decrease"} ${namedProduct} quantity by ${Math.abs(command.quantity)}`
          : `Set ${namedProduct} quantity to ${command.quantity}`,
        goal: `Change ${productName ?? "a Cart Item"} quantity`,
        successMessage(cart) {
          const quantity = cart.items.find(
            ({ productId }) => productId === command.productId,
          )?.quantity;
          if (quantity === undefined) {
            throw new Error("Changed Cart Item is missing from the result.");
          }
          if (command.mode === "EXACT") {
            return `Set ${productName} quantity to ${quantity}.`;
          }
          return `${command.quantity > 0 ? "Increased" : "Decreased"} ${productName} quantity to ${quantity}.`;
        },
        execute(cart, complete) {
          if (!cart.applyMutations) {
            throw new Error("Cart Mutation commands are unavailable.");
          }
          return cart.applyMutations([{
            type: "CHANGE_QUANTITY",
            productId: command.productId,
            change: { mode: command.mode, quantity: command.quantity },
          }], complete);
        },
      };
    }
  }
}

function invalidCommand(message: string): Response {
  return errorResponse(
    { code: "INVALID_CART_COMMAND", message, details: {} },
    400,
  );
}
