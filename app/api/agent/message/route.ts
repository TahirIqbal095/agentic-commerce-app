import {
  createCommerceAgent,
  type CommerceAgent,
} from "@/modules/agent/commerce-agent";
import { createAiCommerceAgentLoop } from "@/modules/agent/ai-commerce-agent-loop";
import { createAiIntentAnalyzer } from "@/modules/agent/ai-intent-analyzer";
import { createConversationModule } from "@/modules/agent/conversation";
import { createCatalogModule } from "@/modules/catalog/catalog";
import { createCartModule } from "@/modules/cart/cart";
import { createCartInspection } from "@/modules/cart/cart-inspection";
import { requireBrand } from "@/modules/identity/brand";
import { db } from "@/db";
import {
  createDatabaseGuestSessionStore,
  type GuestSession,
} from "@/modules/identity/guest-session";
import { createMessageRoute } from "./route-factory";

async function createAgentForStorefront(
  guestSession: GuestSession,
): Promise<CommerceAgent> {
  const brand = await requireBrand();

  const catalogModule = createCatalogModule();
  const intentAnalyzer = createAiIntentAnalyzer();
  const conversationModule = createConversationModule(guestSession.id);

  return createCommerceAgent(
    catalogModule,
    intentAnalyzer,
    conversationModule,
    {
      agentLoop: createAiCommerceAgentLoop(),
      cartInspection: createCartInspection(guestSession.id, (guestSessionId) =>
        createCartModule(guestSessionId, brand.currency),
      ),
    },
  );
}

export const POST = createMessageRoute({
  store: createDatabaseGuestSessionStore(db),
  createAgent: createAgentForStorefront,
});
