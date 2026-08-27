import {
  createCommerceAgent,
  type CommerceAgent,
} from "@/modules/agent/commerce-agent";
import { createAiCommerceAgentLoop } from "@/modules/agent/ai-commerce-agent-loop";
import { createAiIntentAnalyzer } from "@/modules/agent/ai-intent-interpreter";
import { createConversationModule } from "@/modules/agent/conversation";
import { createCatalogModule } from "@/modules/catalog/catalog";
import { resolveUserContext } from "@/modules/identity/user-context";
import { resolveMerchantContext } from "@/modules/identity/merchant-context";
import { createPostHandler } from "./handler";

async function createAgentForCurrentMerchant(): Promise<CommerceAgent> {
  const [{ merchantId }, { userId }] = await Promise.all([
    resolveMerchantContext(),
    resolveUserContext(),
  ]);
  return createCommerceAgent(
    createCatalogModule(merchantId),
    createAiIntentAnalyzer(),
    createConversationModule(userId, merchantId),
    { agentLoop: createAiCommerceAgentLoop() },
  );
}

export const POST = createPostHandler(createAgentForCurrentMerchant);
