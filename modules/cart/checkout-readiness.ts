import {
  CART_ITEM_QUANTITY_LIMIT,
  STOREFRONT_CURRENCY,
  toCartViewItem,
  type CartView,
  type CartWithProductAvailability,
} from "./cart";
import type { CartReviewRead } from "./cart-inspection";

/**
 * A reason one Cart cannot proceed to a future checkout.
 *
 * Every reason a Customer can act on names the Cart Item it belongs to, so the
 * deterministic quantity and removal controls beside it are enough to correct
 * the Cart. A reason about the Cart as a whole — it holds no Product, its
 * Currency is unsupported, or its Cart Subtotal does not calculate — names no
 * Cart Item, because no single Item is at fault.
 */
export type CheckoutReadinessBlocker =
  | {
      code: "CART_EMPTY" | "CURRENCY_UNSUPPORTED" | "SUBTOTAL_UNAVAILABLE";
      message: string;
    }
  | {
      code:
        | "PRODUCT_UNAVAILABLE"
        | "INSUFFICIENT_STOCK"
        | "QUANTITY_LIMIT_EXCEEDED";
      productId: string;
      productName: string;
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
 * Judges one Cart Item against the Product state behind it.
 *
 * An unavailable Product is reported first, because removal is the only
 * correction available for it. Otherwise the blocker names whichever of current
 * stock and the Cart Item limit actually binds, so following its instruction
 * once is enough: telling a Customer holding eleven units of a Product stocked
 * at two to "reduce to ten" would only earn them a second blocker. Each Cart
 * Item yields at most one blocker, so a Customer is never given two
 * instructions for one control.
 *
 * @param item - One reviewed Cart Item with its current availability.
 * @returns The blocker for that Cart Item, or `null` when it can proceed.
 */
function blockerForItem(
  item: CartWithProductAvailability["items"][number],
): CheckoutReadinessBlocker | null {
  const identity = { productId: item.productId, productName: item.productName };

  if (!item.isAvailable) {
    return {
      code: "PRODUCT_UNAVAILABLE",
      ...identity,
      message: `${item.productName} is no longer available. Remove it from the Cart to continue.`,
    };
  }
  if (item.quantity <= Math.min(item.stock, CART_ITEM_QUANTITY_LIMIT)) {
    return null;
  }
  if (item.stock >= CART_ITEM_QUANTITY_LIMIT) {
    return {
      code: "QUANTITY_LIMIT_EXCEEDED",
      ...identity,
      message: `${item.productName} cannot have more than ${CART_ITEM_QUANTITY_LIMIT} units in the Cart. Reduce the quantity to ${CART_ITEM_QUANTITY_LIMIT} or fewer.`,
    };
  }
  return {
    code: "INSUFFICIENT_STOCK",
    ...identity,
    message:
      item.stock === 0
        ? `${item.productName} is out of stock. Remove it from the Cart to continue.`
        : `${item.productName} only has ${item.stock} ${item.stock === 1 ? "unit" : "units"} in stock. Reduce the quantity to ${item.stock}, or remove it from the Cart.`,
  };
}

/**
 * Whether every amount in this Cart adds up.
 *
 * ADR-0007 keeps Cart Prices immutable, so a Cart Subtotal that disagrees with
 * its Cart Items, or an amount past safe integer arithmetic, means the Cart
 * cannot be priced rather than that it is expensive. Readiness reports that
 * instead of forwarding a total no one can stand behind.
 *
 * @param cart - The Cart being reviewed, with its Items and Cart Subtotal.
 * @returns Whether the Cart Subtotal calculated successfully.
 */
function cartSubtotalCalculates(cart: CartWithProductAvailability): boolean {
  const isSoundAmount = (amount: number) =>
    Number.isSafeInteger(amount) && amount >= 0;

  return (
    cart.items.every(
      (item) =>
        isSoundAmount(item.quantity) &&
        isSoundAmount(item.cartPriceMinor) &&
        isSoundAmount(item.subtotalMinor) &&
        item.subtotalMinor === item.quantity * item.cartPriceMinor,
    ) &&
    isSoundAmount(cart.subtotalMinor) &&
    cart.subtotalMinor ===
      cart.items.reduce((total, item) => total + item.subtotalMinor, 0)
  );
}

/**
 * Judges the Cart as a whole, apart from the Products in it.
 *
 * ADR-0008 makes INR the Storefront's only Currency and rejects other persisted
 * data rather than converting it, so a Cart priced elsewhere is reported as it
 * stands: no amount on the card is silently reinterpreted as rupees.
 *
 * @param cart - The Cart being reviewed.
 * @returns Every Cart-level reason this Cart cannot proceed.
 */
function blockersForCart(
  cart: CartWithProductAvailability,
): CheckoutReadinessBlocker[] {
  const blockers: CheckoutReadinessBlocker[] = [];

  if (cart.currency !== STOREFRONT_CURRENCY) {
    blockers.push({
      code: "CURRENCY_UNSUPPORTED",
      message: `This Cart is priced in ${cart.currency}, but the Storefront supports Indian rupees (${STOREFRONT_CURRENCY}) only. It cannot be reviewed for checkout.`,
    });
  }
  if (!cartSubtotalCalculates(cart)) {
    blockers.push({
      code: "SUBTOTAL_UNAVAILABLE",
      message:
        "The Cart Subtotal could not be calculated for this Cart. Reload the Cart and review it again.",
    });
  }
  return blockers;
}

/**
 * Creates the Checkout Readiness review for one Guest Session's Cart.
 *
 * The review is a read: it reaches the Cart only through the read-only review
 * capability, reserves no inventory, and creates no commercial record. The
 * availability it judges is dropped from the result, so a stored readiness card
 * carries the Cart the Customer saw and nothing more. A Cart is ready only when
 * it holds a Product, its Currency is supported, its Cart Subtotal calculates,
 * and every Cart Item is available within stock and the Cart Item limit. A Cart
 * read failure is surfaced rather than answered with a fabricated readiness
 * result.
 *
 * @param cartReview - Read-only reviewing capability owned by the Guest Session.
 * @returns A review that evaluates the authoritative Cart on demand.
 */
export function createCheckoutReadinessReview(
  cartReview: CartReviewRead,
): CheckoutReadinessReview {
  return {
    async review() {
      const reviewedCart = await cartReview.readCartForReview();
      const { items, ...cart } = reviewedCart;
      const blockers: CheckoutReadinessBlocker[] =
        items.length === 0
          ? [
              {
                code: "CART_EMPTY",
                message:
                  "Add at least one Product to the Cart before checkout.",
              },
            ]
          : [
              ...blockersForCart(reviewedCart),
              ...items
                .map(blockerForItem)
                .filter((blocker) => blocker !== null),
            ];

      return {
        status: blockers.length === 0 ? "READY" : "NOT_READY",
        cart: { ...cart, items: items.map(toCartViewItem) },
        blockers,
      };
    },
  };
}

/**
 * Whether a readiness result no longer describes the current Cart.
 *
 * A readiness result is a judgement about one Cart version, so any successful
 * Cart mutation retires it: the Customer must see a historical card as history
 * rather than as permission to continue. A Cart the Storefront has not read
 * yet cannot retire anything, so an unknown Cart leaves the result standing.
 *
 * @param readiness - The readiness result being displayed.
 * @param currentCart - The authoritative Cart, or `null` when it is unknown.
 * @returns Whether the result must be presented as Outdated.
 */
export function isCheckoutReadinessOutdated(
  readiness: CheckoutReadiness,
  currentCart: CartView | null,
): boolean {
  if (!currentCart) return false;
  return (
    currentCart.id !== readiness.cart.id ||
    currentCart.version > readiness.cart.version
  );
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
