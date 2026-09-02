import type {
  CartModule,
  CartReviewSource,
  CartView,
  CartWithProductAvailability,
} from "./cart";

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

/**
 * The read-only Cart capability Checkout Readiness needs.
 *
 * It reads more than the Commerce Agent's inspection — the availability behind
 * each Cart Item — and still cannot change the Cart, because a review is a
 * point-in-time judgement that reserves nothing.
 */
export interface CartReviewRead {
  readCartForReview(): Promise<CartWithProductAvailability>;
}

/**
 * Creates the Checkout Readiness Cart read owned by one Guest Session.
 *
 * Like Cart inspection, the read is bound to the supplied Guest Session and
 * frozen, so no Cart command of the underlying Cart module can be reached
 * through a review.
 *
 * @param guestSessionId - Browser-scoped Guest Session that owns the Cart.
 * @param createCart - Cart module factory for that Guest Session.
 * @returns A read-only reviewing capability scoped to the Guest Session.
 */
export function createCartReviewRead(
  guestSessionId: string,
  createCart: (guestSessionId: string) => CartReviewSource,
): CartReviewRead {
  const cart = createCart(guestSessionId);
  return Object.freeze({
    readCartForReview: () => cart.inspectForReview(),
  });
}
