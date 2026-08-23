import type { CatalogModule } from "@/modules/catalog/catalog";
import { AgentMessage, AgentResponse } from "./types";

export interface CommerceAgent {
  respond(input: AgentMessage): Promise<AgentResponse>;
}

export function createCommerceAgent(catalog: CatalogModule): CommerceAgent {
  return {
    async respond(): Promise<AgentResponse> {
      const result = await catalog.search({ limit: 20 });

      return {
        message:
          result.products.length === 0
            ? "There are no products available right now."
            : "Here are the products currently available in our catalog.",
        products: result.products,
      };
    },
  };
}
