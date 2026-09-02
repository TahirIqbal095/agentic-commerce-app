/**
 * The Cart's shapes and authoritative rules, free of any database access.
 *
 * The Cart drawer, the Cart Summary, and a Checkout Readiness card all run in
 * the browser, so the values and rules they share with the server live here
 * rather than beside the Cart module's database client. Importing a rule must
 * never drag a database driver into a Customer's browser.
 */

export type CartSummary = {
  id: string;
  version: number;
  totalQuantity: number;
  subtotalMinor: number;
  currency: string;
};

export type CartView = Omit<CartSummary, "id"> & {
  id: string | null;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    cartPriceMinor: number;
    subtotalMinor: number;
  }>;
};

/**
 * A Cart read together with each Cart Item's current authoritative
 * availability.
 *
 * Checkout Readiness needs the Product state behind a Cart Item, not only the
 * commercial values a Customer sees, so it re-reads availability and stock in
 * the same read as the Cart itself. The availability is deliberately absent
 * from `CartView`, so it can never reach a persisted readiness card, a Cart
 * Summary, or the Commerce Agent.
 */
export type CartWithProductAvailability = Omit<CartView, "items"> & {
  items: Array<
    CartView["items"][number] & {
      isAvailable: boolean;
      stock: number;
    }
  >;
};

/**
 * The authoritative whole-unit ceiling for one Cart Item.
 *
 * Cart commands refuse to exceed it and Checkout Readiness reports a Cart Item
 * that already does, so both speak about the same limit.
 */
export const CART_ITEM_QUANTITY_LIMIT = 10;

/**
 * The only Currency the Storefront supports, named by ADR-0008.
 *
 * Persisted data outside it is rejected rather than converted, so Cart commands
 * and Checkout Readiness both refuse a Cart priced in anything else.
 */
export const STOREFRONT_CURRENCY = "INR";

/**
 * Narrows one reviewed Cart Item to the commercial values a Customer sees.
 *
 * Checkout Readiness judges availability but must not carry it into the Cart it
 * reports, so the Cart in a readiness result is built through this narrowing.
 *
 * @param item - One Cart Item read with its current Product availability.
 * @returns The same Cart Item without any inventory state.
 */
export function toCartViewItem({
  productId,
  productName,
  quantity,
  cartPriceMinor,
  subtotalMinor,
}: CartWithProductAvailability["items"][number]): CartView["items"][number] {
  return { productId, productName, quantity, cartPriceMinor, subtotalMinor };
}
