import assert from "node:assert/strict";
import test from "node:test";
import { createCartInspection } from "./cart-inspection";
import { createCheckoutReadinessReview } from "./checkout-readiness";
import type { CartView } from "./cart";

const guestSessionId = "21000000-0000-4000-8000-000000000001";

function reviewOf(cart: CartView | (() => Promise<CartView>)) {
  return createCheckoutReadinessReview(
    createCartInspection(guestSessionId, () => ({
      inspect: typeof cart === "function" ? cart : async () => cart,
    })),
  );
}

const stockedCart: CartView = {
  id: "31000000-0000-4000-8000-000000000001",
  version: 4,
  items: [
    {
      productId: "11000000-0000-4000-8000-000000000001",
      productName: "Quiet Buds",
      quantity: 2,
      cartPriceMinor: 349900,
      subtotalMinor: 699800,
    },
    {
      productId: "11000000-0000-4000-8000-000000000002",
      productName: "Trail Runner",
      quantity: 1,
      cartPriceMinor: 899900,
      subtotalMinor: 899900,
    },
  ],
  totalQuantity: 3,
  subtotalMinor: 1599700,
  currency: "INR",
};

const emptyCart: CartView = {
  id: null,
  version: 0,
  items: [],
  totalQuantity: 0,
  subtotalMinor: 0,
  currency: "INR",
};

test("a non-empty Cart is ready with its authoritative Items, Cart Prices, and Cart version", async () => {
  const readiness = await reviewOf(stockedCart).review();

  assert.equal(readiness.status, "READY");
  assert.deepEqual(readiness.blockers, []);
  assert.equal(readiness.cart.version, 4);
  assert.deepEqual(readiness.cart.items, stockedCart.items);
  assert.equal(readiness.cart.subtotalMinor, 1599700);
  assert.equal(readiness.cart.currency, "INR");
});

test("an empty Cart is not ready and explains that at least one Product is required", async () => {
  const readiness = await reviewOf(emptyCart).review();

  assert.equal(readiness.status, "NOT_READY");
  assert.deepEqual(readiness.blockers, [
    {
      code: "CART_EMPTY",
      message: "Add at least one Product to the Cart before checkout.",
    },
  ]);
  assert.equal(readiness.cart.version, 0);
  assert.deepEqual(readiness.cart.items, []);
  assert.equal(readiness.cart.subtotalMinor, 0);
});

test("a readiness result carries no Checkout Proposal, Order, or payment state", async () => {
  const readiness = await reviewOf(stockedCart).review();

  assert.deepEqual(Object.keys(readiness).sort(), [
    "blockers",
    "cart",
    "status",
  ]);
});

test("a failed Cart read surfaces the failure instead of a fabricated readiness", async () => {
  const review = reviewOf(async () => {
    throw new Error("Cart read failed");
  });

  await assert.rejects(review.review(), /Cart read failed/);
});
