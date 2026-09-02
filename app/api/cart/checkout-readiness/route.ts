import { db } from "@/db";
import { createConversationState } from "@/modules/agent/conversation-state";
import { createCartModule } from "@/modules/cart/cart";
import { createCartInspection } from "@/modules/cart/cart-inspection";
import { createCheckoutReadinessReview } from "@/modules/cart/checkout-readiness";
import { createDatabaseGuestSessionStore } from "@/modules/identity/guest-session";
import { createCheckoutReadinessRoute } from "./route-factory";

export const POST = createCheckoutReadinessRoute({
  store: createDatabaseGuestSessionStore(db),
  createReview: (guestSession) =>
    createCheckoutReadinessReview(
      createCartInspection(guestSession.id, createCartModule),
    ),
  createState: (guestSession) => createConversationState(guestSession.id),
});
