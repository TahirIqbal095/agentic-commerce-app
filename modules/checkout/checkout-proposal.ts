/**
 * The Checkout Proposal's shapes and arithmetic, free of any database,
 * provider, or model access.
 *
 * The proposal card renders in the browser and the Approval authority
 * revalidates on the server, so both read the totals, expiry, and policy from
 * this one module. Importing a proposal rule must never drag a database driver
 * or a payment credential into a Customer's browser.
 */

import type { CartView } from "@/modules/cart/cart-view";
import type { CheckoutReadiness } from "@/modules/cart/checkout-readiness";
import {
  CHECKOUT_PROPOSAL_LIFETIME_MS,
  STOREFRONT_CURRENCY,
  checkoutBoundViolations,
  type CheckoutBoundViolation,
} from "./checkout-bounds";

export { CHECKOUT_PROPOSAL_LIFETIME_MS };

/**
 * One Product's exact contribution to the payable total.
 *
 * The Cart Price is retained beside the quantity that multiplies it, so a
 * Customer approving a total can check every rupee in it against the Cart they
 * shaped rather than against a single summed figure.
 */
export type CheckoutProposalLine = {
  productId: string;
  productName: string;
  quantity: number;
  cartPriceMinor: number;
  lineTotalMinor: number;
};

/**
 * The recorded Brand policy result for one prepared checkout.
 *
 * This release always requires explicit Approval, and says so in the
 * Customer's words rather than as a rule identifier. The reason code is the
 * durable, deterministic half; the explanation is the half a Customer reads.
 */
export type CheckoutPolicyEvaluation = {
  result: "REQUIRE_APPROVAL";
  reasonCode: "PAYMENT_REQUIRES_CUSTOMER_APPROVAL";
  explanation: string;
};

export const CHECKOUT_POLICY_EVALUATION: CheckoutPolicyEvaluation = {
  result: "REQUIRE_APPROVAL",
  reasonCode: "PAYMENT_REQUIRES_CUSTOMER_APPROVAL",
  explanation:
    "Payment always needs your explicit approval. Nothing is sent to Razorpay until you approve the exact amount below.",
};

export type CheckoutProposalStatus =
  | "ACTIVE"
  | "CONSUMED"
  | "INVALIDATED"
  | "EXPIRED";

/**
 * An immutable commercial summary a Customer may approve.
 *
 * Every amount a Customer is asked to authorize is present and explained:
 * Discount, Shipping, and Tax are carried as explicit zeros rather than
 * omitted, so the payable total is fully accounted for instead of merely
 * asserted. The Cart identity and version say which Cart state the proposal
 * describes, and the expiry says how long those commercial facts stand.
 */
export type CheckoutProposal = {
  id: string;
  cartId: string;
  cartVersion: number;
  currency: string;
  lines: CheckoutProposalLine[];
  itemsSubtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  taxMinor: number;
  checkoutTotalMinor: number;
  policy: CheckoutPolicyEvaluation;
  status: CheckoutProposalStatus;
  expiresAt: string;
  preparedAt: string;
};

/**
 * The result of asking the Storefront to prepare a checkout.
 *
 * A Cart that cannot proceed is answered with the deterministic Checkout
 * Readiness result the Customer already knows how to correct, rather than with
 * a proposal that hides the blocker. A checkout the Brand has not configured
 * for Razorpay Test Mode, or a Cart outside the bounds, is answered as
 * unavailable and explained — the rest of the Storefront stays usable.
 */
export type CheckoutPreparation =
  | { status: "PREPARED"; proposal: CheckoutProposal }
  | { status: "NOT_READY"; readiness: CheckoutReadiness }
  | {
      status: "UNAVAILABLE";
      reasonCode: string;
      explanation: string;
      violations: CheckoutBoundViolation[];
    };

/**
 * Builds the exact amounts one Cart would be charged.
 *
 * ADR-0012 keeps this release free of discounts, shipping, and tax, so those
 * are explicit zeros and the Checkout Total is the authoritative Cart Subtotal
 * unchanged. No amount is introduced between the Cart a Customer shaped and
 * the total they approve.
 *
 * @param cart - The authoritative Cart being prepared.
 * @returns The proposal's lines and every amount that makes up its total.
 */
export function checkoutAmountsForCart(cart: CartView): {
  lines: CheckoutProposalLine[];
  itemsSubtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  taxMinor: number;
  checkoutTotalMinor: number;
} {
  const lines = cart.items.map((item) => ({
    productId: item.productId,
    productName: item.productName,
    quantity: item.quantity,
    cartPriceMinor: item.cartPriceMinor,
    lineTotalMinor: item.subtotalMinor,
  }));
  return {
    lines,
    itemsSubtotalMinor: cart.subtotalMinor,
    discountMinor: 0,
    shippingMinor: 0,
    taxMinor: 0,
    checkoutTotalMinor: cart.subtotalMinor,
  };
}

/**
 * Prepares one immutable Checkout Proposal from a ready Cart.
 *
 * The caller supplies the identity and the clock, so the same Cart prepared
 * twice under one Customer command key yields the same proposal rather than a
 * second one. The bounds are judged here, before a Customer is ever shown an
 * Approval control for an amount checkout could not collect.
 *
 * @param readiness - A deterministic readiness result for the Cart.
 * @param identity - The proposal's own ID and preparation time.
 * @returns The prepared proposal, the blocking readiness, or an explanation.
 */
export function prepareCheckoutProposal(
  readiness: CheckoutReadiness,
  identity: { id: string; now: Date },
): CheckoutPreparation {
  const cartId = readiness.cart.id;
  if (readiness.status !== "READY" || cartId === null) {
    return { status: "NOT_READY", readiness };
  }

  const cart = readiness.cart;
  const amounts = checkoutAmountsForCart(cart);
  const violations = checkoutBoundViolations({
    currency: cart.currency,
    items: cart.items.map(({ productName, quantity }) => ({
      productName,
      quantity,
    })),
    totalMinor: amounts.checkoutTotalMinor,
  });
  if (violations.length > 0) {
    return {
      status: "UNAVAILABLE",
      reasonCode: "CHECKOUT_BOUNDS_EXCEEDED",
      explanation:
        "This Cart is outside the limits of the Razorpay Test Checkout demonstration.",
      violations,
    };
  }

  return {
    status: "PREPARED",
    proposal: {
      id: identity.id,
      cartId,
      cartVersion: cart.version,
      currency: STOREFRONT_CURRENCY,
      ...amounts,
      policy: CHECKOUT_POLICY_EVALUATION,
      status: "ACTIVE",
      preparedAt: identity.now.toISOString(),
      expiresAt: new Date(
        identity.now.getTime() + CHECKOUT_PROPOSAL_LIFETIME_MS,
      ).toISOString(),
    },
  };
}

/**
 * Whether a proposal can still be approved at this moment.
 *
 * Expiry is judged from the stored instant rather than from a countdown the
 * browser kept, so a tab left open overnight cannot authorize payment on stale
 * commercial facts.
 *
 * @param proposal - The proposal being offered for Approval.
 * @param now - The instant the Approval is being judged at.
 */
export function isCheckoutProposalActionable(
  proposal: Pick<CheckoutProposal, "status" | "expiresAt">,
  now: Date,
): boolean {
  return (
    proposal.status === "ACTIVE" &&
    now.getTime() < new Date(proposal.expiresAt).getTime()
  );
}

/**
 * Whether the Cart has moved on from the state this proposal describes.
 *
 * A Cart Mutation retires an unconsumed proposal: the Customer must review the
 * changed Items and quantities before authorizing an amount again. A Cart the
 * Storefront has not read yet retires nothing, exactly as an unread Cart
 * cannot outdate a readiness card.
 *
 * @param proposal - The proposal being displayed.
 * @param currentCart - The authoritative Cart, or `null` when it is unknown.
 */
export function isCheckoutProposalOutdated(
  proposal: Pick<CheckoutProposal, "cartId" | "cartVersion">,
  currentCart: CartView | null,
): boolean {
  if (!currentCart || currentCart.id === null) return false;
  return (
    currentCart.id !== proposal.cartId ||
    currentCart.version > proposal.cartVersion
  );
}

/**
 * Whether a persisted value has the shape of a Checkout Proposal.
 *
 * Reload paths use it so a Transcript renders a stored proposal only when its
 * identity, amounts, and expiry are all present.
 */
export function isCheckoutProposal(value: unknown): value is CheckoutProposal {
  if (typeof value !== "object" || value === null) return false;
  const proposal = value as Partial<CheckoutProposal>;
  return (
    typeof proposal.id === "string" &&
    typeof proposal.cartId === "string" &&
    typeof proposal.cartVersion === "number" &&
    typeof proposal.checkoutTotalMinor === "number" &&
    typeof proposal.expiresAt === "string" &&
    Array.isArray(proposal.lines)
  );
}
