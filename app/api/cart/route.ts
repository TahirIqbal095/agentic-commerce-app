import { db } from "@/db";
import { createCartModule } from "@/modules/cart/cart";
import { createCatalogModule } from "@/modules/catalog/catalog";
import { createDatabaseGuestSessionStore } from "@/modules/identity/guest-session";
import { createAddToCartRoute, createCartRoute } from "./route-factory";

const store = createDatabaseGuestSessionStore(db);
const createCart = (guestSession: { id: string }) =>
  createCartModule(guestSession.id);

export const GET = createCartRoute({
  store,
  createCart,
});

export const POST = createAddToCartRoute({
  store,
  catalog: createCatalogModule(),
  createCart,
});
