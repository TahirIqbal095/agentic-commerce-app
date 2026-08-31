import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import type { CartView } from "@/modules/cart/cart";

async function renderCart(t: TestContext, cart: CartView) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  const [{ render, cleanup, within }, { CartPanel }] = await Promise.all([
    import("@testing-library/react"),
    import("./cart-panel"),
  ]);
  t.after(() => {
    cleanup();
    dom.window.close();
  });

  return {
    view: render(React.createElement(CartPanel, { cart })),
    within,
  };
}

test("Customer sees when a Product's current base price increased above its retained Cart Price", async (t) => {
  const { view, within } = await renderCart(t, {
        id: "31000000-0000-4000-8000-000000000001",
        items: [
          {
            productId: "21000000-0000-4000-8000-000000000001",
            productName: "Road Two",
            quantity: 2,
            cartPriceMinor: 390000,
            subtotalMinor: 780000,
            priceComparison: {
              currentBasePriceMinor: 410000,
              direction: "INCREASED",
            },
          },
        ],
        totalQuantity: 2,
        subtotalMinor: 780000,
        currency: "INR",
  });

  const item = within(view.getByRole("listitem"));
  assert.ok(item.getByText("2 × Cart Price ₹3,900"));
  assert.ok(item.getByText("Current price ₹4,100 — increased"));
  assert.equal(item.getByLabelText("Road Two subtotal").textContent, "₹7,800");
  assert.equal(view.getAllByText("₹7,800").length, 2);
});

test("Customer sees when a Product's current base price decreased below its retained Cart Price", async (t) => {
  const { view, within } = await renderCart(t, {
        id: "31000000-0000-4000-8000-000000000001",
        items: [
          {
            productId: "21000000-0000-4000-8000-000000000001",
            productName: "Road Two",
            quantity: 2,
            cartPriceMinor: 410000,
            subtotalMinor: 820000,
            priceComparison: {
              currentBasePriceMinor: 390000,
              direction: "DECREASED",
            },
          },
        ],
        totalQuantity: 2,
        subtotalMinor: 820000,
        currency: "INR",
  });

  const item = within(view.getByRole("listitem"));
  assert.ok(item.getByText("2 × Cart Price ₹4,100"));
  assert.ok(item.getByText("Current price ₹3,900 — decreased"));
  assert.equal(item.getByLabelText("Road Two subtotal").textContent, "₹8,200");
  assert.equal(view.getAllByText("₹8,200").length, 2);
});

test("Customer still sees a Cart Item when its Product becomes inactive", async (t) => {
  const { view, within } = await renderCart(t, {
        id: "31000000-0000-4000-8000-000000000001",
        items: [
          {
            productId: "21000000-0000-4000-8000-000000000001",
            productName: "Road Two",
            quantity: 1,
            cartPriceMinor: 390000,
            subtotalMinor: 390000,
            availabilityWarning: { reason: "INACTIVE" },
          },
        ],
        totalQuantity: 1,
        subtotalMinor: 390000,
        currency: "INR",
  });

  const item = within(view.getByRole("listitem"));
  assert.ok(item.getByText("Road Two"));
  assert.ok(item.getByRole("alert"));
  assert.ok(item.getByText("This Product is no longer active."));
  assert.equal(item.getByLabelText("Road Two subtotal").textContent, "₹3,900");
});

test("Customer still sees a Cart Item when current stock is below its quantity", async (t) => {
  const { view, within } = await renderCart(t, {
        id: "31000000-0000-4000-8000-000000000001",
        items: [
          {
            productId: "21000000-0000-4000-8000-000000000001",
            productName: "Road Two",
            quantity: 3,
            cartPriceMinor: 390000,
            subtotalMinor: 1170000,
            availabilityWarning: {
              reason: "INSUFFICIENT_STOCK",
              availableQuantity: 1,
            },
          },
        ],
        totalQuantity: 3,
        subtotalMinor: 1170000,
        currency: "INR",
  });

  const item = within(view.getByRole("listitem"));
  assert.ok(item.getByText("Road Two"));
  assert.ok(item.getByRole("alert"));
  assert.ok(item.getByText("Only 1 of 3 units is currently available."));
  assert.equal(item.getByLabelText("Road Two subtotal").textContent, "₹11,700");
});

test("Customer sees the direction when adding the same Product reprices its entire Cart Item", async (t) => {
  const { view, within } = await renderCart(t, {
    id: "31000000-0000-4000-8000-000000000001",
    items: [
      {
        productId: "21000000-0000-4000-8000-000000000001",
        productName: "Road Two",
        quantity: 2,
        cartPriceMinor: 410000,
        subtotalMinor: 820000,
      },
    ],
    totalQuantity: 2,
    subtotalMinor: 820000,
    currency: "INR",
    priceChange: {
      productId: "21000000-0000-4000-8000-000000000001",
      previousCartPriceMinor: 390000,
      currentCartPriceMinor: 410000,
    },
  });

  const item = within(view.getByRole("listitem"));
  assert.ok(
    item.getByText("Cart Price increased from ₹3,900 to ₹4,100."),
  );
  assert.ok(item.getByText("2 × ₹4,100"));
  assert.equal(item.getByLabelText("Road Two subtotal").textContent, "₹8,200");
});
