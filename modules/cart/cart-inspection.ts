import type { CartModule, CartView } from "./cart";

/**
 * The narrow read-only Cart capability named by ADR-0004.
 *
 * The Commerce Agent never changes the Cart, so this capability deliberately
 * exposes inspection alone.
 */
export interface CartInspection {
  inspectCart(): Promise<CartView>;
}

/**
 * Creates the Cart inspection capability owned by one Guest Session.
 *
 * Reads are bound to the supplied Guest Session, and the returned capability is
 * frozen so no add, quantity, removal, or clearing operation of the underlying
 * Cart module can be reached through it.
 *
 * @param guestSessionId - Browser-scoped Guest Session that owns the Cart.
 * @param createCart - Cart module factory for that Guest Session.
 * @returns A read-only Cart capability scoped to the Guest Session.
 */
export function createCartInspection(
  guestSessionId: string,
  createCart: (guestSessionId: string) => Pick<CartModule, "inspect">,
): CartInspection {
  const cart = createCart(guestSessionId);
  return Object.freeze({
    inspectCart: () => cart.inspect(),
  });
}
