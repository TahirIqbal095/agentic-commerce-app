import { db } from "@/db";
import { createCartModule } from "@/modules/cart/cart";
import { createCatalogModule } from "@/modules/catalog/catalog";
import { createCheckoutProposalStore } from "@/modules/checkout/checkout-store";
import { createDatabaseGuestSessionStore } from "@/modules/identity/guest-session";
import {
  createAddToCartRoute,
  createCartRoute,
  createRemoveCartItemRoute,
  createUpdateCartItemRoute,
} from "./route-factory";

const store = createDatabaseGuestSessionStore(db);
const createCart = (guestSession: { id: string }) =>
  createCartModule(guestSession.id);

/**
 * Every Cart command retires the Checkout Proposals its change outdated, so a
 * proposal prepared from an earlier Cart version stops being actionable at the
 * moment the Cart moves rather than at the moment someone notices.
 */
const retireCheckoutProposals = async (
  guestSession: { id: string },
  cart: { id: string | null; version: number },
) => {
  if (!cart.id) return;
  await createCheckoutProposalStore(guestSession.id, db).invalidateOlderThan(
    cart.id,
    cart.version,
  );
};

export const GET = createCartRoute({
  store,
  createCart,
});

export const POST = createAddToCartRoute({
  store,
  catalog: createCatalogModule(),
  createCart,
  retireCheckoutProposals,
});

export const PATCH = createUpdateCartItemRoute({
  store,
  createCart,
  retireCheckoutProposals,
});

export const DELETE = createRemoveCartItemRoute({
  store,
  createCart,
  retireCheckoutProposals,
});
