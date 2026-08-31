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
import { CartError, type CartModule } from "@/modules/cart/cart";

type CommandModules = {
  cart: CartModule;
  conversation: ConversationModule;
};

type CommandFactory = () => Promise<CommandModules>;

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
    const command = "command" in body ? body.command : undefined;
    if (typeof conversationId !== "string" || !isUuid(conversationId)) {
      return invalidCommand("conversationId must be a UUID.");
    }
    if (typeof idempotencyKey !== "string" || !isUuid(idempotencyKey)) {
      return invalidCommand("idempotencyKey must be a UUID.");
    }
    if (
      typeof command !== "object" ||
      command === null ||
      !("type" in command) ||
      command.type !== "REMOVE_CART_ITEM" ||
      !("productId" in command) ||
      typeof command.productId !== "string" ||
      !isUuid(command.productId)
    ) {
      return invalidCommand("command must identify one Cart Item to remove.");
    }

    try {
      const { cart, conversation } = await createModules();
      const currentCart = await cart.inspect();
      const item = currentCart.items.find(
        ({ productId }) => productId === command.productId,
      );
      const customerMessage = item
        ? `Remove ${item.productName} from my Cart`
        : "Remove this Cart Item from my Cart";
      const turn = await conversation.startTurn({
        conversationId,
        idempotencyKey,
        message: customerMessage,
      });
      if (turn.duplicateOutcome) return dataResponse(turn.duplicateOutcome);
      if (!item) {
        const failure = removalFailureOutcome({
          conversationId: turn.conversationId,
          constraints: turn.context!.productConstraints,
          cart: currentCart,
          message: "That Cart Item is no longer in your Cart.",
        });
        await turn.complete(failure.message, failure);
        return dataResponse(failure);
      }
      if (!cart.removeItemByProductId) {
        throw new Error("Cart Item Removal is unavailable.");
      }

      let outcome: CompletedAgentOutcome | undefined;
      let updatedCart;
      try {
        updatedCart = await cart.removeItemByProductId(
          item.productId,
          async (authoritativeCart, transaction) => {
            const message = `Removed ${item.productName} from your Cart.`;
            outcome = {
              status: "COMPLETED",
              conversationId: turn.conversationId,
              message,
              intentBrief: {
                goal: `Remove ${item.productName} from the Cart`,
                constraints: turn.context!.productConstraints,
                knownEntities: [],
                missingInformation: [],
                confidence: 1,
                requestedEffects: ["REMOVE_FROM_CART"],
              },
              products: [],
              cart: authoritativeCart,
            };
            await turn.complete(message, outcome, transaction);
          },
        );
      } catch (error) {
        if (!(error instanceof CartError)) throw error;
        const authoritativeCart = await cart.inspect();
        const failure = removalFailureOutcome({
          conversationId: turn.conversationId,
          constraints: turn.context!.productConstraints,
          cart: authoritativeCart,
          productId: item.productId,
          productName: item.productName,
          message: error.message,
        });
        await turn.complete(failure.message, failure);
        return dataResponse(failure);
      }
      if (!outcome) {
        throw new Error("Cart Item Removal did not complete its Conversation Turn.");
      }
      if (outcome.cart !== updatedCart) {
        throw new Error("Cart Item Removal returned inconsistent Cart state.");
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

function removalFailureOutcome({
  conversationId,
  constraints,
  cart,
  message,
  productId,
  productName,
}: {
  conversationId: string;
  constraints: NeedsInputAgentOutcome["intentBrief"]["constraints"];
  cart: NeedsInputAgentOutcome["cart"];
  message: string;
  productId?: string;
  productName?: string;
}): NeedsInputAgentOutcome {
  return {
    status: "NEEDS_INPUT",
    conversationId,
    message,
    question: productName
      ? `Would you like to try removing ${productName} again?`
      : "Would you like to inspect your Cart again?",
    missingInformation: [],
    intentBrief: {
      goal: productName
        ? `Remove ${productName} from the Cart`
        : "Remove a Cart Item",
      constraints,
      knownEntities: [],
      missingInformation: [],
      confidence: 1,
      requestedEffects: ["REMOVE_FROM_CART"],
    },
    products: [],
    cart,
    ...(productId ? { cartItemError: { productId, message } } : {}),
  };
}

function invalidCommand(message: string): Response {
  return errorResponse(
    { code: "INVALID_CART_COMMAND", message, details: {} },
    400,
  );
}
