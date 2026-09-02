import assert from "node:assert/strict";
import test from "node:test";
import { createCartInspection } from "./cart-inspection";
import type { CartModule, CartView } from "./cart";

const EMPTY_CART: CartView = {
  id: null,
  version: 0,
  items: [],
  totalQuantity: 0,
  subtotalMinor: 0,
  currency: "INR",
};

function writableCartModule(inspect: () => Promise<CartView>): CartModule {
  const write = async () => {
    throw new Error("A write operation must never be reachable.");
  };
  return {
    inspect,
    addItem: write,
    addItems: write,
    changeItemQuantity: write,
    removeItem: write,
    replayMutation: async () => null,
  };
}

test("Cart inspection reads only the Cart owned by the Guest Session", async () => {
  const ownedCart: CartView = {
    id: "31000000-0000-4000-8000-000000000001",
    version: 3,
    items: [
      {
        productId: "11000000-0000-4000-8000-000000000001",
        productName: "Quiet Buds",
        quantity: 2,
        cartPriceMinor: 349900,
        subtotalMinor: 699800,
      },
    ],
    totalQuantity: 2,
    subtotalMinor: 699800,
    currency: "INR",
  };
  const owners: string[] = [];

  const inspection = createCartInspection("guest-session-1", (guestSessionId) => {
    owners.push(guestSessionId);
    return writableCartModule(async () => ownedCart);
  });

  assert.deepEqual(await inspection.inspectCart(), ownedCart);
  assert.deepEqual(owners, ["guest-session-1"]);
});

test("Cart inspection exposes no add, quantity, removal, or clearing operation", async () => {
  const inspection = createCartInspection("guest-session-1", () =>
    writableCartModule(async () => EMPTY_CART),
  );

  assert.deepEqual(Object.keys(inspection), ["inspectCart"]);
  for (const writeOperation of [
    "addItem",
    "addItems",
    "changeItemQuantity",
    "removeItem",
    "replayMutation",
    "clear",
  ]) {
    assert.equal(
      Object.hasOwn(inspection, writeOperation),
      false,
      `${writeOperation} must not be reachable through Cart inspection.`,
    );
  }
  assert.equal(Object.isFrozen(inspection), true);
});

test("Cart inspection surfaces a read failure instead of a fabricated Cart", async () => {
  const inspection = createCartInspection("guest-session-1", () =>
    writableCartModule(async () => {
      throw new Error("The Cart is unavailable.");
    }),
  );

  await assert.rejects(inspection.inspectCart(), /The Cart is unavailable\./);
});
