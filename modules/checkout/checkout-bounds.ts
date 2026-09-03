/**
 * The bounds one Conversational Checkout may never exceed, free of any
 * database or provider access.
 *
 * A Checkout Proposal is prepared against these bounds and Approval revalidates
 * them, so a Cart that grew, a total that moved, or a retry that arrived late
 * is judged by exactly the same limits the Customer was shown. They live beside
 * the Cart's own rules rather than inside a route, because the browser, the
 * proposal, and the Approval authority all speak about the same numbers.
 */

import { STOREFRONT_CURRENCY } from "@/modules/cart/cart-view";

export { STOREFRONT_CURRENCY };

/** Distinct Cart Items one Checkout Proposal may carry. */
export const CHECKOUT_MIN_CART_ITEMS = 1;
export const CHECKOUT_MAX_CART_ITEMS = 20;

/** Whole units one Cart Item may carry into checkout. */
export const CHECKOUT_MIN_ITEM_QUANTITY = 1;
export const CHECKOUT_MAX_ITEM_QUANTITY = 10;

/** The payable Checkout Total's inclusive range, in minor units of INR. */
export const CHECKOUT_MIN_TOTAL_MINOR = 100;
export const CHECKOUT_MAX_TOTAL_MINOR = 5_000_000;

/** Reconciliation reads permitted after one Unknown Provider Outcome. */
export const CHECKOUT_MAX_RECONCILIATION_READS = 3;

/** Managed Checkout launches permitted against one Provider Order. */
export const CHECKOUT_MAX_PAYMENT_ATTEMPTS = 3;

/** How long a prepared Checkout Proposal stays actionable. */
export const CHECKOUT_PROPOSAL_LIFETIME_MS = 10 * 60 * 1000;

/**
 * A bound a Cart failed, named so the Customer is told which limit binds.
 *
 * Each code carries one deterministic Customer-safe explanation, because a
 * Customer correcting a Cart needs the limit itself, never the rule's internals.
 */
export type CheckoutBoundViolation = {
  code:
    | "CART_ITEM_COUNT_ABOVE_LIMIT"
    | "ITEM_QUANTITY_ABOVE_LIMIT"
    | "TOTAL_BELOW_MINIMUM"
    | "TOTAL_ABOVE_MAXIMUM"
    | "CURRENCY_UNSUPPORTED";
  message: string;
};

export type CheckoutBoundedCart = {
  currency: string;
  items: Array<{ productName: string; quantity: number }>;
  totalMinor: number;
};

/**
 * Judges one Cart and its payable total against every checkout bound.
 *
 * The Currency is judged first: a Cart priced elsewhere makes every rupee
 * bound meaningless, so no amount is reinterpreted as rupees to test it. The
 * remaining bounds are reported together, so a Customer sees each limit they
 * must satisfy rather than one per attempt.
 *
 * @param cart - The Cart and Checkout Total being prepared or approved.
 * @returns Every bound this checkout exceeds, in a stable order.
 */
export function checkoutBoundViolations(
  cart: CheckoutBoundedCart,
): CheckoutBoundViolation[] {
  if (cart.currency !== STOREFRONT_CURRENCY) {
    return [
      {
        code: "CURRENCY_UNSUPPORTED",
        message: `This Cart is priced in ${cart.currency}, but checkout collects Indian rupees (${STOREFRONT_CURRENCY}) only.`,
      },
    ];
  }

  const violations: CheckoutBoundViolation[] = [];
  if (cart.items.length > CHECKOUT_MAX_CART_ITEMS) {
    violations.push({
      code: "CART_ITEM_COUNT_ABOVE_LIMIT",
      message: `Checkout accepts up to ${CHECKOUT_MAX_CART_ITEMS} different Products. Remove ${cart.items.length - CHECKOUT_MAX_CART_ITEMS} to continue.`,
    });
  }
  for (const item of cart.items) {
    if (item.quantity > CHECKOUT_MAX_ITEM_QUANTITY) {
      violations.push({
        code: "ITEM_QUANTITY_ABOVE_LIMIT",
        message: `${item.productName} cannot have more than ${CHECKOUT_MAX_ITEM_QUANTITY} units at checkout. Reduce the quantity to ${CHECKOUT_MAX_ITEM_QUANTITY} or fewer.`,
      });
    }
  }
  if (cart.items.length >= CHECKOUT_MIN_CART_ITEMS) {
    if (cart.totalMinor < CHECKOUT_MIN_TOTAL_MINOR) {
      violations.push({
        code: "TOTAL_BELOW_MINIMUM",
        message: `Razorpay Test Checkout collects at least ${formatBound(CHECKOUT_MIN_TOTAL_MINOR)}. This Cart totals ${formatBound(cart.totalMinor)}.`,
      });
    }
    if (cart.totalMinor > CHECKOUT_MAX_TOTAL_MINOR) {
      violations.push({
        code: "TOTAL_ABOVE_MAXIMUM",
        message: `Checkout is limited to ${formatBound(CHECKOUT_MAX_TOTAL_MINOR)} in this test release. This Cart totals ${formatBound(cart.totalMinor)}.`,
      });
    }
  }
  return violations;
}

/**
 * Renders one bound as the Customer reads it, without importing the browser's
 * money formatter into rule code that also runs on the server.
 */
function formatBound(amountMinor: number): string {
  return `₹${(amountMinor / 100).toLocaleString("en-IN")}`;
}
