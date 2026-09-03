import { db } from "@/db";
import { createStorefrontCheckoutAuthority } from "@/modules/checkout/checkout-composition";
import { createDatabaseGuestSessionStore } from "@/modules/identity/guest-session";
import { createCheckoutCallbackRoute } from "../../route-factory";

export const POST = createCheckoutCallbackRoute({
  store: createDatabaseGuestSessionStore(db),
  createAuthority: createStorefrontCheckoutAuthority,
});
