import { dataResponse, unexpectedErrorResponse } from "@/lib/http/responses";
import type { ConversationState } from "@/modules/agent/conversation-state";
import type { CheckoutReadinessReview } from "@/modules/cart/checkout-readiness";
import {
  createGuestSessionRoute,
  type GuestSession,
  type GuestSessionStore,
} from "@/modules/identity/guest-session";

type CheckoutReadinessRouteOptions = {
  store: GuestSessionStore;
  createReview: (guestSession: GuestSession) => CheckoutReadinessReview;
  createState: (
    guestSession: GuestSession,
  ) => Pick<ConversationState, "recordCheckoutReadiness">;
  issueToken?: () => string;
  now?: () => Date;
};

/**
 * Creates the explicit Review for checkout route.
 *
 * The route is deterministic end to end: it reads the Guest Session's
 * authoritative Cart, evaluates readiness, and records the Customer Action
 * Entry that carries the result. It never reaches the Commerce Agent, reserves
 * no inventory, and creates no Checkout Proposal, Approval, Order, or payment
 * state. A Cart read failure records nothing, so a retry cannot leave a
 * readiness card the Customer never saw in the Transcript.
 */
export function createCheckoutReadinessRoute(
  options: CheckoutReadinessRouteOptions,
) {
  return createGuestSessionRoute(
    async (_request, guestSession) => {
      try {
        const readiness = await options.createReview(guestSession).review();
        const entry = await options
          .createState(guestSession)
          .recordCheckoutReadiness(readiness);
        return dataResponse(entry);
      } catch (error) {
        console.error("Checkout Readiness review failed", error);
        return unexpectedErrorResponse();
      }
    },
    {
      store: options.store,
      ...(options.issueToken ? { issueToken: options.issueToken } : {}),
      ...(options.now ? { now: options.now } : {}),
    },
  );
}
