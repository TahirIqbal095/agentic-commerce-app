import { dataResponse, unexpectedErrorResponse } from "@/lib/http/responses";
import type { CartModule } from "@/modules/cart/cart";
import {
  createGuestSessionBrowsingRoute,
  type GuestSession,
  type GuestSessionStore,
} from "@/modules/identity/guest-session";

type CartRouteOptions = {
  store: GuestSessionStore;
  createCart: (guestSession: GuestSession) => CartModule;
  now?: () => Date;
};

export function createCartRoute(options: CartRouteOptions) {
  return createGuestSessionBrowsingRoute(
    async (_request, guestSession) => {
      if (!guestSession) {
        return dataResponse({
          id: null,
          items: [],
          totalQuantity: 0,
          subtotalMinor: 0,
          currency: "INR",
        });
      }
      try {
        return dataResponse(await options.createCart(guestSession).inspect());
      } catch (error) {
        console.error("Current Cart load failed", error);
        return unexpectedErrorResponse();
      }
    },
    {
      store: options.store,
      ...(options.now ? { now: options.now } : {}),
    },
  );
}
