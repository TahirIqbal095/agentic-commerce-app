import {
  createCommerceAgent,
  type CommerceAgent,
} from "@/modules/agent/commerce-agent";
import { createAiCommerceAgentLoop } from "@/modules/agent/ai-commerce-agent-loop";
import { createAiIntentAnalyzer } from "@/modules/agent/ai-intent-analyzer";
import { createConversationModule } from "@/modules/agent/conversation";
import { createCatalogModule } from "@/modules/catalog/catalog";
import { requireBrand } from "@/modules/identity/brand";
import { resolveUserContext } from "@/modules/identity/user-context";
import { createPostHandler } from "./handler";

async function createAgentForStorefront(): Promise<CommerceAgent> {
  const [, { userId }] = await Promise.all([
    requireBrand(),
    resolveUserContext(),
  ]);

  const catalogModule = createCatalogModule();
  const intentAnalyzer = createAiIntentAnalyzer();
  const conversationModule = createConversationModule(userId);

  return createCommerceAgent(
    catalogModule,
    intentAnalyzer,
    conversationModule,
    { agentLoop: createAiCommerceAgentLoop() },
  );
}

export const POST = createPostHandler(createAgentForStorefront);
