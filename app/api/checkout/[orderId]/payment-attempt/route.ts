import { db } from "@/db";
import { createStorefrontCheckoutAuthority } from "@/modules/checkout/checkout-composition";
import { createDatabaseGuestSessionStore } from "@/modules/identity/guest-session";
import { createPaymentAttemptRoute } from "../../route-factory";

export const POST = createPaymentAttemptRoute({
  store: createDatabaseGuestSessionStore(db),
  createAuthority: createStorefrontCheckoutAuthority,
});
