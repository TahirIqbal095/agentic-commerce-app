import { db } from "@/db";
import { createStorefrontCheckoutAuthority } from "@/modules/checkout/checkout-composition";
import { createDatabaseGuestSessionStore } from "@/modules/identity/guest-session";
import { createCheckoutApprovalRoute } from "../route-factory";

export const POST = createCheckoutApprovalRoute({
  store: createDatabaseGuestSessionStore(db),
  createAuthority: createStorefrontCheckoutAuthority,
});
