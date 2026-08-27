import type { CatalogModule } from "@/modules/catalog/catalog";
import { CartError, type CartModule } from "@/modules/cart/cart";
import { ConversationAccessError } from "./conversation";
import type {
  AgentMessage,
  AgentOutcome,
  AgentResponse,
  CommerceIntent,
  IntentBrief,
} from "./types";

export interface CommerceAgent {
  respond(input: AgentMessage): Promise<AgentOutcome>;
}

export interface LegacyCommerceAgent {
  respond(input: AgentMessage): Promise<AgentResponse>;
}

export interface IntentInterpreter {
  interpret(message: string): Promise<CommerceIntent>;
}

export interface IntentAnalyzer {
  analyze(message: string): Promise<IntentBrief>;
}

export interface OutcomeComposer {
  composeCompleted(input: {
    message: string;
    intentBrief: IntentBrief;
    products: AgentOutcome["products"];
  }): Promise<string>;
  composeQuestion(input: {
    message: string;
    intentBrief: IntentBrief;
  }): Promise<string>;
}

type AgentTurn = {
  conversationId: string;
  recordIntentBrief(intentBrief: IntentBrief): Promise<void>;
  complete(assistantMessage: string, outcome: AgentOutcome): Promise<void>;
};

export interface ConversationModule {
  startTurn(input: AgentMessage): Promise<AgentTurn>;
}

export interface LegacyConversationModule {
  startTurn(input: AgentMessage): Promise<{
    conversationId: string;
    complete(assistantMessage: string): Promise<void>;
  }>;
}

type CommerceAgentOptions = {
  outcomeComposer: OutcomeComposer;
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
        let intentBrief: IntentBrief;
        try {
          intentBrief = await analyzer.analyze(input.message);
        } catch {
          const outcome: AgentOutcome = {
            status: "TEMPORARILY_UNAVAILABLE",
            conversationId: turn.conversationId,
            message: "I couldn't understand that request right now. Please try again.",
            retryable: true,
            products: [],
          };
          return completeTurn(turn, outcome);
        }

        try {
          await turn.recordIntentBrief(intentBrief);
        } catch {
          return completeTurn(turn, {
            status: "TEMPORARILY_UNAVAILABLE",
            conversationId: turn.conversationId,
            message: "I couldn't save that request right now. Please try again.",
            retryable: true,
            intentBrief,
            products: [],
          });
        }
        if (intentBrief.missingInformation.length > 0) {
          let outcome: AgentOutcome;
          try {
            const question = await options.outcomeComposer.composeQuestion({
              message: input.message,
              intentBrief,
            });
            outcome = {
              status: "NEEDS_INPUT",
              conversationId: turn.conversationId,
              message: question,
              question,
              missingInformation: intentBrief.missingInformation,
              intentBrief,
              products: [],
            };
          } catch {
            outcome = {
              status: "TEMPORARILY_UNAVAILABLE",
              conversationId: turn.conversationId,
              message: "I couldn't prepare a response right now. Please try again.",
              retryable: true,
              intentBrief,
              products: [],
            };
          }
          return completeTurn(turn, outcome);
        }

        let outcome: AgentOutcome;
        try {
          const result = await catalog.search(toCatalogSearch(intentBrief.constraints));
          const message = await options.outcomeComposer.composeCompleted({
            message: input.message,
            intentBrief,
            products: result.products,
          });
          outcome = {
            status: "COMPLETED",
            conversationId: turn.conversationId,
            message,
            intentBrief,
            products: result.products,
          };
        } catch {
          outcome = {
            status: "TEMPORARILY_UNAVAILABLE",
            conversationId: turn.conversationId,
            message: "Product discovery is temporarily unavailable. Please try again.",
            retryable: true,
            intentBrief,
            products: [],
          };
        }
        return completeTurn(turn, outcome);
      },
  };
}

export function createLegacyCommerceAgent(
  catalog: CatalogModule,
  interpreter: IntentInterpreter,
  conversation: LegacyConversationModule,
  cart?: CartModule,
): LegacyCommerceAgent {
  return {
    async respond(input): Promise<AgentResponse> {
      const turn = await conversation.startTurn(input);
      const response = await (async (): Promise<Omit<AgentResponse, "conversationId">> => {
        const intent = await interpreter.interpret(input.message);

        if ("action" in intent) {
          if (!cart) throw new Error("The cart capability is unavailable.");

          const result = await catalog.search({
            query: intent.productName,
            inStockOnly: true,
            limit: 2,
          });
          const product = result.products[0];
          if (!product || result.products.length !== 1) {
            return {
              message:
                result.products.length === 0
                  ? `I couldn't find an available product named ${intent.productName}.`
                  : `I found multiple products matching ${intent.productName}. Please be more specific.`,
              products: result.products,
            };
          }

          let cartSummary;
          try {
            cartSummary = await cart.addItem(product, intent.quantity);
          } catch (error) {
            if (error instanceof CartError) {
              return {
                message: `I couldn't add that to your cart. ${error.message}`,
                products: [],
              };
            }
            throw error;
          }
          return {
            message: `Added ${intent.quantity} × ${product.name} to your cart.`,
            products: [],
            cart: cartSummary,
          };
        }

        const result = await catalog.search(toCatalogSearch(intent));

        return {
          message:
            result.products.length === 0
              ? "I couldn't find products matching that request. Try a broader product type, feature, or price range."
              : `I found ${result.products.length} ${result.products.length === 1 ? "product" : "products"} matching your request.`,
          intent,
          products: result.products,
        };
      })();

      await turn.complete(response.message);
      return { ...response, conversationId: turn.conversationId };
    },
  };
}

function toCatalogSearch(intent: IntentBrief["constraints"]) {
  return {
    ...(intent.productTypes.length > 0 ? { productTypes: intent.productTypes } : {}),
    ...(intent.useCases.length > 0 ? { useCases: intent.useCases } : {}),
    ...(intent.features.length > 0 ? { features: intent.features } : {}),
    ...(intent.category !== null ? { category: intent.category } : {}),
    ...(intent.minPriceMinor !== null ? { minPriceMinor: intent.minPriceMinor } : {}),
    ...(intent.maxPriceMinor !== null ? { maxPriceMinor: intent.maxPriceMinor } : {}),
    ...(intent.size !== null ? { size: intent.size } : {}),
    inStockOnly: intent.inStockOnly,
    ...(Object.keys(intent.attributes).length > 0
      ? { attributes: intent.attributes }
      : {}),
    limit: 20,
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
