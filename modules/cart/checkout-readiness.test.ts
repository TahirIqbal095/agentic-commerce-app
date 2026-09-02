import assert from "node:assert/strict";
import test from "node:test";
import { createCartReviewRead } from "./cart-inspection";
import {
  createCheckoutReadinessReview,
  isCheckoutReadinessOutdated,
  type CheckoutReadiness,
} from "./checkout-readiness";
import type { CartView, CartWithProductAvailability } from "./cart";

const guestSessionId = "21000000-0000-4000-8000-000000000001";

function reviewOf(cart: CartWithProductAvailability | (() => Promise<CartWithProductAvailability>)) {
  return createCheckoutReadinessReview(
    createCartReviewRead(guestSessionId, () => ({
      inspectForReview: typeof cart === "function" ? cart : async () => cart,
    })),
  );
}

const quietBuds = {
  productId: "11000000-0000-4000-8000-000000000001",
  productName: "Quiet Buds",
  quantity: 2,
  cartPriceMinor: 349900,
  subtotalMinor: 699800,
  isAvailable: true,
  stock: 6,
};

const trailRunner = {
  productId: "11000000-0000-4000-8000-000000000002",
  productName: "Trail Runner",
  quantity: 1,
  cartPriceMinor: 899900,
  subtotalMinor: 899900,
  isAvailable: true,
  stock: 3,
};

/**
 * Builds a Cart whose amounts agree with its Cart Items, so a test that changes
 * a quantity does not accidentally assert against a Cart Subtotal that no
 * longer adds up.
 */
function cartOf(
  ...items: CartWithProductAvailability["items"]
): CartWithProductAvailability {
  const pricedItems = items.map((item) => ({
    ...item,
    subtotalMinor: item.quantity * item.cartPriceMinor,
  }));
  return {
    id: "31000000-0000-4000-8000-000000000001",
    version: 4,
    items: pricedItems,
    totalQuantity: pricedItems.reduce((total, item) => total + item.quantity, 0),
    subtotalMinor: pricedItems.reduce(
      (total, item) => total + item.subtotalMinor,
      0,
    ),
    currency: "INR",
  };
}

const stockedCart = cartOf(quietBuds, trailRunner);

const emptyCart: CartWithProductAvailability = {
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
  assert.deepEqual(readiness.cart.items, [
    {
      productId: quietBuds.productId,
      productName: "Quiet Buds",
      quantity: 2,
      cartPriceMinor: 349900,
      subtotalMinor: 699800,
    },
    {
      productId: trailRunner.productId,
      productName: "Trail Runner",
      quantity: 1,
      cartPriceMinor: 899900,
      subtotalMinor: 899900,
    },
  ]);
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

test("an unavailable Product blocks readiness and names the Cart Item to remove", async () => {
  const readiness = await reviewOf(
    cartOf({ ...quietBuds, isAvailable: false }, trailRunner),
  ).review();

  assert.equal(readiness.status, "NOT_READY");
  assert.deepEqual(readiness.blockers, [
    {
      code: "PRODUCT_UNAVAILABLE",
      productId: quietBuds.productId,
      productName: "Quiet Buds",
      message:
        "Quiet Buds is no longer available. Remove it from the Cart to continue.",
    },
  ]);
});

test("a quantity above current stock blocks readiness and names the stocked quantity", async () => {
  const readiness = await reviewOf(
    cartOf({ ...quietBuds, quantity: 3, stock: 1 }),
  ).review();

  assert.equal(readiness.status, "NOT_READY");
  assert.deepEqual(readiness.blockers, [
    {
      code: "INSUFFICIENT_STOCK",
      productId: quietBuds.productId,
      productName: "Quiet Buds",
      message:
        "Quiet Buds only has 1 unit in stock. Reduce the quantity to 1, or remove it from the Cart.",
    },
  ]);
});

test("an out-of-stock Cart Item is blocked with a removal instruction rather than a lower quantity", async () => {
  const readiness = await reviewOf(cartOf({ ...quietBuds, stock: 0 })).review();

  assert.deepEqual(readiness.blockers, [
    {
      code: "INSUFFICIENT_STOCK",
      productId: quietBuds.productId,
      productName: "Quiet Buds",
      message:
        "Quiet Buds is out of stock. Remove it from the Cart to continue.",
    },
  ]);
});

test("a quantity above the authoritative Cart Item limit blocks readiness", async () => {
  const readiness = await reviewOf(
    cartOf({ ...quietBuds, quantity: 11, stock: 40 }),
  ).review();

  assert.deepEqual(readiness.blockers, [
    {
      code: "QUANTITY_LIMIT_EXCEEDED",
      productId: quietBuds.productId,
      productName: "Quiet Buds",
      message:
        "Quiet Buds cannot have more than 10 units in the Cart. Reduce the quantity to 10 or fewer.",
    },
  ]);
});

test("a Cart Item beyond both the limit and its stock names the quantity stock allows", async () => {
  const readiness = await reviewOf(
    cartOf({ ...quietBuds, quantity: 11, stock: 2 }),
  ).review();

  assert.deepEqual(readiness.blockers, [
    {
      code: "INSUFFICIENT_STOCK",
      productId: quietBuds.productId,
      productName: "Quiet Buds",
      message:
        "Quiet Buds only has 2 units in stock. Reduce the quantity to 2, or remove it from the Cart.",
    },
  ]);
});

test("every blocked Cart Item is reported once, in Cart order", async () => {
  const readiness = await reviewOf(
    cartOf(
      { ...quietBuds, isAvailable: false, stock: 0 },
      { ...trailRunner, quantity: 2, stock: 1 },
    ),
  ).review();

  assert.deepEqual(
    readiness.blockers.map((blocker) => [
      blocker.code,
      "productName" in blocker ? blocker.productName : null,
    ]),
    [
      ["PRODUCT_UNAVAILABLE", "Quiet Buds"],
      ["INSUFFICIENT_STOCK", "Trail Runner"],
    ],
  );
});

test("a Cart priced outside Indian rupees is not ready and is never converted", async () => {
  const readiness = await reviewOf({
    ...stockedCart,
    currency: "USD",
  }).review();

  assert.equal(readiness.status, "NOT_READY");
  assert.deepEqual(readiness.blockers, [
    {
      code: "CURRENCY_UNSUPPORTED",
      message:
        "This Cart is priced in USD, but the Storefront supports Indian rupees (INR) only. It cannot be reviewed for checkout.",
    },
  ]);
  assert.equal(readiness.cart.currency, "USD");
  assert.equal(readiness.cart.subtotalMinor, 1599700);
});

test("a Cart Subtotal that does not add up is not ready", async () => {
  const readiness = await reviewOf({
    ...stockedCart,
    subtotalMinor: 1,
  }).review();

  assert.equal(readiness.status, "NOT_READY");
  assert.deepEqual(readiness.blockers, [
    {
      code: "SUBTOTAL_UNAVAILABLE",
      message:
        "The Cart Subtotal could not be calculated for this Cart. Reload the Cart and review it again.",
    },
  ]);
});

test("a Cart Item amount that does not add up blocks the Cart Subtotal", async () => {
  const cart = cartOf(quietBuds);
  const readiness = await reviewOf({
    ...cart,
    items: [{ ...cart.items[0], subtotalMinor: 1 }],
  }).review();

  assert.deepEqual(
    readiness.blockers.map((blocker) => blocker.code),
    ["SUBTOTAL_UNAVAILABLE"],
  );
});

test("a Cart amount beyond safe calculation blocks the Cart Subtotal", async () => {
  const readiness = await reviewOf(
    cartOf({
      ...quietBuds,
      quantity: 2,
      cartPriceMinor: Number.MAX_SAFE_INTEGER,
      subtotalMinor: Number.MAX_SAFE_INTEGER * 2,
    }),
  ).review();

  assert.deepEqual(
    readiness.blockers.map((blocker) => blocker.code),
    ["SUBTOTAL_UNAVAILABLE"],
  );
});

test("a Cart both mispriced and short of stock reports each reason once", async () => {
  const readiness = await reviewOf({
    ...cartOf({ ...quietBuds, quantity: 3, stock: 1 }),
    currency: "USD",
  }).review();

  assert.deepEqual(
    readiness.blockers.map((blocker) => blocker.code),
    ["CURRENCY_UNSUPPORTED", "INSUFFICIENT_STOCK"],
  );
});

test("a readiness result carries no Checkout Proposal, Order, or payment state", async () => {
  const readiness = await reviewOf(stockedCart).review();

  assert.deepEqual(Object.keys(readiness).sort(), [
    "blockers",
    "cart",
    "status",
  ]);
});

test("a readiness result carries no inventory reservation of its evaluated Cart", async () => {
  const readiness = await reviewOf(stockedCart).review();

  assert.deepEqual(Object.keys(readiness.cart.items[0]).sort(), [
    "cartPriceMinor",
    "productId",
    "productName",
    "quantity",
    "subtotalMinor",
  ]);
});

test("a failed Cart read surfaces the failure instead of a fabricated readiness", async () => {
  const review = reviewOf(async () => {
    throw new Error("Cart read failed");
  });

  await assert.rejects(review.review(), /Cart read failed/);
});

function readinessOfCart(cart: CartView): CheckoutReadiness {
  return { status: "READY", cart, blockers: [] };
}

const evaluatedCart: CartView = {
  id: "31000000-0000-4000-8000-000000000001",
  version: 4,
  items: [],
  totalQuantity: 0,
  subtotalMinor: 0,
  currency: "INR",
};

test("a readiness result stays current while its evaluated Cart version is the latest", () => {
  assert.equal(
    isCheckoutReadinessOutdated(readinessOfCart(evaluatedCart), evaluatedCart),
    false,
  );
});

test("a later Cart version makes an earlier readiness result outdated", () => {
  assert.equal(
    isCheckoutReadinessOutdated(readinessOfCart(evaluatedCart), {
      ...evaluatedCart,
      version: 5,
    }),
    true,
  );
});

test("a readiness result for an empty Cart is outdated once a Cart exists", () => {
  const emptyReadiness = readinessOfCart({
    ...evaluatedCart,
    id: null,
    version: 0,
  });

  assert.equal(isCheckoutReadinessOutdated(emptyReadiness, evaluatedCart), true);
  assert.equal(
    isCheckoutReadinessOutdated(emptyReadiness, {
      ...evaluatedCart,
      id: null,
      version: 0,
    }),
    false,
  );
});

test("an unknown current Cart leaves a readiness result unjudged rather than outdated", () => {
  assert.equal(
    isCheckoutReadinessOutdated(readinessOfCart(evaluatedCart), null),
    false,
  );
});
