import { db } from "@/db";
import { createStorefrontCheckoutAuthority } from "@/modules/checkout/checkout-composition";
import { createDatabaseGuestSessionStore } from "@/modules/identity/guest-session";
import { createCheckoutStatusRoute } from "../route-factory";

export const GET = createCheckoutStatusRoute({
  store: createDatabaseGuestSessionStore(db),
  createAuthority: createStorefrontCheckoutAuthority,
});
