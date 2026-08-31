import {
  createCommerceAgent,
  type CommerceAgent,
} from "@/modules/agent/commerce-agent";
import { createAiCommerceAgentLoop } from "@/modules/agent/ai-commerce-agent-loop";
import { createAiIntentAnalyzer } from "@/modules/agent/ai-intent-analyzer";
import { createConversationModule } from "@/modules/agent/conversation";
import { createCatalogModule } from "@/modules/catalog/catalog";
import { createCartModule } from "@/modules/cart/cart";
import { requireBrand } from "@/modules/identity/brand";
import { resolveCustomerContext } from "@/modules/identity/customer-context";
import { resolveUserContext } from "@/modules/identity/user-context";
import { createPostHandler } from "./handler";

async function createAgentForStorefront(): Promise<CommerceAgent> {
  const [brand, { userId }, { customerId }] = await Promise.all([
    requireBrand(),
    resolveUserContext(),
    resolveCustomerContext(),
  ]);

  const catalogModule = createCatalogModule();
  const intentAnalyzer = createAiIntentAnalyzer();
  const conversationModule = createConversationModule(userId);

  return createCommerceAgent(
    catalogModule,
    intentAnalyzer,
    conversationModule,
    {
      agentLoop: createAiCommerceAgentLoop(),
      cart: createCartModule(customerId, brand.currency),
    },
  );
}

export const POST = createPostHandler(createAgentForStorefront);
