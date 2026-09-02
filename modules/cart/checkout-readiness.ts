import type { CartView } from "./cart";
import type { CartInspection } from "./cart-inspection";

export type CheckoutReadinessBlocker = {
  code: "CART_EMPTY";
  message: string;
};

/**
 * The deterministic result of reviewing one Cart for a future checkout.
 *
 * The evaluated Cart is carried whole, so the Cart version, Items, quantities,
 * Cart Prices, and Cart Subtotal a Customer saw can never drift from the
 * decision made about them. A blocker explains why the Cart cannot proceed.
 */
export type CheckoutReadiness = {
  status: "READY" | "NOT_READY";
  cart: CartView;
  blockers: CheckoutReadinessBlocker[];
};

/**
 * The terminal seam of the current scope, named by ADR-0006.
 *
 * Future conversational checkout consumes this review; it deliberately stops
 * before any Checkout Proposal, Approval, Order, or payment behavior.
 */
export interface CheckoutReadinessReview {
  review(): Promise<CheckoutReadiness>;
}

/**
 * Creates the Checkout Readiness review for one Guest Session's Cart.
 *
 * The review is a read: it reaches the Cart only through the read-only
 * inspection capability, reserves no inventory, and creates no commercial
 * record. A Cart read failure is surfaced rather than answered with a
 * fabricated readiness result.
 *
 * @param cartInspection - Read-only Cart capability owned by the Guest Session.
 * @returns A review that evaluates the authoritative Cart on demand.
 */
export function createCheckoutReadinessReview(
  cartInspection: CartInspection,
): CheckoutReadinessReview {
  return {
    async review() {
      const cart = await cartInspection.inspectCart();
      const blockers: CheckoutReadinessBlocker[] =
        cart.items.length === 0
          ? [
              {
                code: "CART_EMPTY",
                message:
                  "Add at least one Product to the Cart before checkout.",
              },
            ]
          : [];

      return {
        status: blockers.length === 0 ? "READY" : "NOT_READY",
        cart,
        blockers,
      };
    },
  };
}

/**
 * Whether a persisted value has the shape of a readiness result.
 *
 * Reload paths use it so a Transcript renders a stored card only when its
 * status, evaluated Cart, and blockers are all present.
 */
export function isCheckoutReadiness(value: unknown): value is CheckoutReadiness {
  if (typeof value !== "object" || value === null) return false;
  const { status, cart, blockers } = value as {
    status?: unknown;
    cart?: unknown;
    blockers?: unknown;
  };
  return (
    (status === "READY" || status === "NOT_READY") &&
    Array.isArray(blockers) &&
    typeof cart === "object" &&
    cart !== null &&
    Array.isArray((cart as { items?: unknown }).items)
  );
}
