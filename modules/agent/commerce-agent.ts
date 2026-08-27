import type { CatalogModule } from "@/modules/catalog/catalog";
import type { AgentMessage, AgentResponse, ShoppingIntent } from "./types";

export interface CommerceAgent {
  respond(input: AgentMessage): Promise<AgentResponse>;
}

export interface IntentInterpreter {
  interpret(message: string): Promise<ShoppingIntent>;
}

export interface ConversationModule {
  startTurn(input: AgentMessage): Promise<{
    conversationId: string;
    complete(assistantMessage: string): Promise<void>;
  }>;
}

export function createCommerceAgent(
  catalog: CatalogModule,
  interpreter: IntentInterpreter,
  conversation: ConversationModule,
): CommerceAgent {
  return {
    async respond(input): Promise<AgentResponse> {
      const turn = await conversation.startTurn(input);
      const intent = await interpreter.interpret(input.message);
      const result = await catalog.search({
        ...(intent.productTypes.length > 0
          ? { productTypes: intent.productTypes }
          : {}),
        ...(intent.useCases.length > 0 ? { useCases: intent.useCases } : {}),
        ...(intent.features.length > 0 ? { features: intent.features } : {}),
        ...(intent.category !== null ? { category: intent.category } : {}),
        ...(intent.minPriceMinor !== null
          ? { minPriceMinor: intent.minPriceMinor }
          : {}),
        ...(intent.maxPriceMinor !== null
          ? { maxPriceMinor: intent.maxPriceMinor }
          : {}),
        ...(intent.size !== null ? { size: intent.size } : {}),
        inStockOnly: intent.inStockOnly,
        ...(Object.keys(intent.attributes).length > 0
          ? { attributes: intent.attributes }
          : {}),
        limit: 20,
      });

      const response = {
        message:
          result.products.length === 0
            ? "I couldn't find products matching that request. Try a broader product type, feature, or price range."
            : `I found ${result.products.length} ${result.products.length === 1 ? "product" : "products"} matching your request.`,
        intent,
        products: result.products,
      };
      await turn.complete(response.message);
      return { ...response, conversationId: turn.conversationId };
    },
  };
}
