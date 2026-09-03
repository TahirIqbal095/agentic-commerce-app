import { db } from "@/db";
import { createConversationState } from "@/modules/agent/conversation-state";
import { createStorefrontCheckoutAuthority } from "@/modules/checkout/checkout-composition";
import { createDatabaseGuestSessionStore } from "@/modules/identity/guest-session";
import { createCheckoutProposalRoute } from "../route-factory";

export const POST = createCheckoutProposalRoute({
  store: createDatabaseGuestSessionStore(db),
  createAuthority: createStorefrontCheckoutAuthority,
  createState: (guestSession) => createConversationState(guestSession.id),
});
