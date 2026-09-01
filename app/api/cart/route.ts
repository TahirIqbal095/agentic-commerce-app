import { db } from "@/db";
import { createCartModule } from "@/modules/cart/cart";
import { createDatabaseGuestSessionStore } from "@/modules/identity/guest-session";
import { createCartRoute } from "./route-factory";

export const GET = createCartRoute({
  store: createDatabaseGuestSessionStore(db),
  createCart: (guestSession) => createCartModule(guestSession.id),
});
