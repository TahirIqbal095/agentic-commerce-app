import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { installBrowser } from "./_test/browser";
import type { CustomerActionEntry } from "@/modules/agent/customer-action-entry";
import type { CheckoutReadiness } from "@/modules/cart/checkout-readiness";
import type { CartView } from "@/modules/cart/cart";
import { createEmptyConversationContext } from "@/modules/agent/intent";

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

function readinessEntry(readiness: CheckoutReadiness): CustomerActionEntry {
  return {
    id: "51000000-0000-4000-8000-000000000002",
    action: "CHECKOUT_READINESS",
    message: "Review my Cart for checkout",
    provenance: "GENERATED",
    readiness,
  };
}

const readyReadiness: CheckoutReadiness = {
  status: "READY",
  cart: stockedCart,
  blockers: [],
};

const notReadyReadiness: CheckoutReadiness = {
  status: "NOT_READY",
  cart: emptyCart,
  blockers: [
    {
      code: "CART_EMPTY",
      message: "Add at least one Product to the Cart before checkout.",
    },
  ],
};

type CartCommand = { type: string; productId: string };

async function reviewTheCart(
  t: TestContext,
  dom: JSDOM,
  cart: CartView,
  readinessResponse: () => Promise<Response> | Response,
  cartCommandResponse?: (command: CartCommand) => Response,
) {
  installBrowser(dom);
  const requests: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push(`${init?.method ?? "GET"} ${url}`);
    if (url === "/api/agent/conversation") return Response.json({ data: null });
    if (url === "/api/cart" && !init?.method) {
      return Response.json({ data: cart });
    }
    if (url === "/api/cart" && cartCommandResponse) {
      return cartCommandResponse(JSON.parse(String(init?.body)) as CartCommand);
    }
    if (url === "/api/cart/checkout-readiness" && init?.method === "POST") {
      return readinessResponse();
    }
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
  };

  const [testingLibrary, userEvent, { ShoppingAssistant }] = await Promise.all([
    import("@testing-library/react"),
    import("@testing-library/user-event").then((module) => module.default),
    import("./shopping-assistant"),
  ]);
  const view = testingLibrary.render(
    React.createElement(ShoppingAssistant, {
      brandName: "Arc",
      brandDescription: "Everyday footwear and accessories.",
      resumeConversation: true,
    }),
  );
  t.after(() => {
    testingLibrary.cleanup();
    dom.window.close();
  });

  const user = userEvent.setup({ document: dom.window.document });
  await user.click(
    await view.findByRole("button", { name: `Cart · ${cart.totalQuantity}` }),
  );
  const drawer = view.getByRole("dialog", { name: "Your Cart" });
  const review = testingLibrary
    .within(drawer)
    .getByRole("button", { name: "Review for checkout" });
  return { view, within: testingLibrary.within, user, requests, review };
}

test("Review for checkout renders a deterministic readiness card without the model", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  const { view, within, user, requests, review } = await reviewTheCart(
    t,
    dom,
    stockedCart,
    () => Response.json({ data: readinessEntry(readyReadiness) }),
  );

  await user.click(review);

  const card = await view.findByRole("region", { name: "Checkout readiness" });
  assert.ok(within(card).getByText("Ready for checkout"));
  assert.ok(within(card).getByText("Evaluated at Cart version 4"));
  const summary = within(card).getByRole("region", { name: "Your Cart" });
  assert.ok(within(summary).getByText("2 × ₹3,499"));
  assert.ok(within(summary).getByText("1 × ₹8,999"));
  assert.equal(within(summary).getByLabelText("Cart Subtotal").textContent, "₹15,997");
  assert.equal(within(summary).queryAllByRole("button").length, 0);
  assert.deepEqual(requests, [
    "GET /api/agent/conversation",
    "GET /api/cart",
    "POST /api/cart/checkout-readiness",
  ]);
});

test("an empty Cart renders a not-ready card explaining that a Product is required", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  const { view, within, user, review } = await reviewTheCart(
    t,
    dom,
    emptyCart,
    () => Response.json({ data: readinessEntry(notReadyReadiness) }),
  );

  await user.click(review);

  const card = await view.findByRole("region", { name: "Checkout readiness" });
  assert.ok(within(card).getByText("Not ready for checkout"));
  assert.ok(
    within(card).getByText("Add at least one Product to the Cart before checkout."),
  );
  assert.ok(within(card).getByText("Your Cart is empty."));
});

test("the Review for checkout control waits for the authoritative result", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  let answerReview!: (response: Response) => void;
  const pendingReview = new Promise<Response>((resolve) => {
    answerReview = resolve;
  });
  const { view, user, review } = await reviewTheCart(
    t,
    dom,
    stockedCart,
    () => pendingReview,
  );

  await user.click(review);

  assert.equal(review.hasAttribute("disabled"), true);
  assert.equal(view.queryByRole("region", { name: "Checkout readiness" }), null);

  answerReview(Response.json({ data: readinessEntry(readyReadiness) }));
  assert.ok(await view.findByRole("region", { name: "Checkout readiness" }));
});

test("a failed review explains the failure instead of showing a readiness card", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  const { view, within, user, review } = await reviewTheCart(
    t,
    dom,
    stockedCart,
    () =>
      Response.json(
        {
          error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
        },
        { status: 500 },
      ),
  );

  await user.click(review);

  const drawer = view.getByRole("dialog", { name: "Your Cart" });
  assert.ok(await within(drawer).findByRole("alert"));
  assert.equal(view.queryByRole("region", { name: "Checkout readiness" }), null);
  assert.equal(review.hasAttribute("disabled"), false);
});

async function resumeTranscript(t: TestContext, dom: JSDOM) {
  installBrowser(dom);
  const [testingLibrary, { ShoppingAssistant }] = await Promise.all([
    import("@testing-library/react"),
    import("./shopping-assistant"),
  ]);
  const view = testingLibrary.render(
    React.createElement(ShoppingAssistant, {
      brandName: "Arc",
      brandDescription: "Everyday footwear and accessories.",
      initialConversation: {
        conversationId: "41000000-0000-4000-8000-000000000001",
        transcript: [
          {
            id: "51000000-0000-4000-8000-000000000001",
            customerMessage: "What is in my Cart?",
            result: null,
            error: null,
          },
          readinessEntry(readyReadiness),
        ],
        contextSummary: createEmptyConversationContext().productConstraints,
        revision: 1,
      },
    }),
  );
  t.after(() => {
    testingLibrary.cleanup();
    dom.window.close();
  });
  return { view, within: testingLibrary.within };
}

test("a recorded Review for checkout and its readiness card survive a refresh", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  const { view, within } = await resumeTranscript(t, dom);

  const card = view.getByRole("region", { name: "Checkout readiness" });
  assert.ok(view.getByText("Review my Cart for checkout"));
  assert.ok(within(card).getByText("Ready for checkout"));
  assert.ok(within(card).getByText("Evaluated at Cart version 4"));
  assert.ok(within(within(card).getByRole("region", { name: "Your Cart" })).getByText("2 × ₹3,499"));
});

test("a Customer Action Entry is aligned with the Customer side but marked as generated", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  const { view, within } = await resumeTranscript(t, dom);

  // Alignment is presentation, so it is asserted as presentation: the entry and
  // a typed message must render the same Customer-side container, whatever that
  // container's styling happens to be.
  const typedMessage = view.getByText("What is in my Cart?").closest("article");
  const entry = view.getByText("Review my Cart for checkout").closest("article");
  assert.ok(typedMessage);
  assert.ok(entry);
  assert.equal(entry.className, typedMessage.className);
  assert.ok(
    within(entry).getByText("Generated by the Review for checkout control"),
  );
});

const oversubscribedCart: CartView = {
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
  ],
  totalQuantity: 2,
  subtotalMinor: 699800,
  currency: "INR",
};

const correctedCart: CartView = {
  ...oversubscribedCart,
  version: 5,
  items: [
    {
      ...oversubscribedCart.items[0],
      quantity: 1,
      subtotalMinor: 349900,
    },
  ],
  totalQuantity: 1,
  subtotalMinor: 349900,
};

const shortStockReadiness: CheckoutReadiness = {
  status: "NOT_READY",
  cart: oversubscribedCart,
  blockers: [
    {
      code: "INSUFFICIENT_STOCK",
      productId: "11000000-0000-4000-8000-000000000001",
      productName: "Quiet Buds",
      message:
        "Quiet Buds only has 1 unit in stock. Reduce the quantity to 1, or remove it from the Cart.",
    },
  ],
};

const unavailableReadiness: CheckoutReadiness = {
  status: "NOT_READY",
  cart: oversubscribedCart,
  blockers: [
    {
      code: "PRODUCT_UNAVAILABLE",
      productId: "11000000-0000-4000-8000-000000000001",
      productName: "Quiet Buds",
      message:
        "Quiet Buds is no longer available. Remove it from the Cart to continue.",
    },
  ],
};

const correctedReadiness: CheckoutReadiness = {
  status: "READY",
  cart: correctedCart,
  blockers: [],
};

test("an unavailable Product blocks the readiness card and names the Cart Item to correct", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  const { view, within, user, requests, review } = await reviewTheCart(
    t,
    dom,
    oversubscribedCart,
    () => Response.json({ data: readinessEntry(unavailableReadiness) }),
  );

  await user.click(review);

  const card = await view.findByRole("region", { name: "Checkout readiness" });
  assert.ok(within(card).getByText("Not ready for checkout"));
  assert.ok(
    within(card).getByText(
      "Quiet Buds is no longer available. Remove it from the Cart to continue.",
    ),
  );
  assert.ok(
    within(card).getByRole("button", { name: "Remove Quiet Buds from Cart" }),
  );
  assert.deepEqual(
    requests.filter((request) => request.endsWith(" /api/cart")),
    ["GET /api/cart"],
  );
});

test("a Cart quantity above current stock blocks readiness with the quantity controls beside it", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  const { view, within, user, review } = await reviewTheCart(
    t,
    dom,
    oversubscribedCart,
    () => Response.json({ data: readinessEntry(shortStockReadiness) }),
  );

  await user.click(review);

  const card = await view.findByRole("region", { name: "Checkout readiness" });
  assert.ok(
    within(card).getByText(
      "Quiet Buds only has 1 unit in stock. Reduce the quantity to 1, or remove it from the Cart.",
    ),
  );
  assert.ok(
    within(card).getByRole("button", {
      name: "Decrease Quiet Buds quantity",
    }),
  );
  assert.ok(
    within(card).getByRole("button", {
      name: "Increase Quiet Buds quantity",
    }),
  );
  assert.ok(
    within(card).getByRole("button", { name: "Remove Quiet Buds from Cart" }),
  );
  assert.ok(within(card).getByText("2 × ₹3,499"));
});

test("correcting a blocker outdates the earlier card and a new review produces a fresh result", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  const readinessResults = [shortStockReadiness, correctedReadiness];
  const { view, within, user, review } = await reviewTheCart(
    t,
    dom,
    oversubscribedCart,
    () =>
      Response.json({
        data: readinessEntry(readinessResults.shift() ?? correctedReadiness),
      }),
    (command) => {
      assert.equal(command.type, "DECREMENT_ITEM");
      return Response.json({ data: correctedCart });
    },
  );

  await user.click(review);
  const blockedCard = await view.findByRole("region", {
    name: "Checkout readiness",
  });
  await user.click(
    within(blockedCard).getByRole("button", {
      name: "Decrease Quiet Buds quantity",
    }),
  );

  assert.ok(await within(blockedCard).findByText("Outdated"));
  assert.equal(
    within(blockedCard).queryByRole("button", {
      name: "Decrease Quiet Buds quantity",
    }),
    null,
  );

  await user.click(view.getByRole("button", { name: "Cart · 1" }));
  await user.click(
    within(view.getByRole("dialog", { name: "Your Cart" })).getByRole(
      "button",
      { name: "Review for checkout" },
    ),
  );

  const cards = await view.findAllByRole("region", {
    name: "Checkout readiness",
  });
  assert.equal(cards.length, 2);
  assert.ok(within(cards[1]).getByText("Ready for checkout"));
  assert.equal(within(cards[1]).queryByText("Outdated"), null);
  assert.ok(within(cards[1]).getByText("Evaluated at Cart version 5"));
});

test("a Cart mutation made outside a readiness card leaves it Outdated and unusable", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  const { view, within, user, review } = await reviewTheCart(
    t,
    dom,
    oversubscribedCart,
    () => Response.json({ data: readinessEntry(shortStockReadiness) }),
    () => Response.json({ data: correctedCart }),
  );

  await user.click(review);
  const card = await view.findByRole("region", { name: "Checkout readiness" });
  await user.click(view.getByRole("button", { name: "Cart · 2" }));
  const drawer = view.getByRole("dialog", { name: "Your Cart" });
  await user.click(
    within(drawer).getByRole("button", {
      name: "Remove Quiet Buds from Cart",
    }),
  );

  assert.ok(await within(card).findByText("Outdated"));
  assert.ok(
    within(card).getByText(
      "The Cart changed after this review. Review the Cart again for a current result.",
    ),
  );
  assert.equal(within(card).queryAllByRole("button").length, 0);
  assert.ok(within(card).getByText("Evaluated at Cart version 4"));
});

test("a successful review claims no inventory reservation", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  const { view, within, user, review } = await reviewTheCart(
    t,
    dom,
    stockedCart,
    () => Response.json({ data: readinessEntry(readyReadiness) }),
  );

  await user.click(review);

  const card = await view.findByRole("region", { name: "Checkout readiness" });
  assert.ok(within(card).getByText("Ready for checkout"));
  assert.ok(
    within(card).getByText(
      "This review reserves no inventory and starts no payment.",
    ),
  );
});

test("a readiness card recorded before a Cart mutation survives the refresh as Outdated history", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  installBrowser(dom);
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === "/api/agent/conversation") {
      return Response.json({
        data: {
          conversationId: "41000000-0000-4000-8000-000000000001",
          transcript: [readinessEntry(readyReadiness)],
          contextSummary: createEmptyConversationContext().productConstraints,
          revision: 1,
        },
      });
    }
    if (url === "/api/cart" && !init?.method) {
      return Response.json({ data: { ...stockedCart, version: 9 } });
    }
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
  };
  const [testingLibrary, { ShoppingAssistant }] = await Promise.all([
    import("@testing-library/react"),
    import("./shopping-assistant"),
  ]);
  const view = testingLibrary.render(
    React.createElement(ShoppingAssistant, {
      brandName: "Arc",
      brandDescription: "Everyday footwear and accessories.",
      resumeConversation: true,
    }),
  );
  t.after(() => {
    testingLibrary.cleanup();
    dom.window.close();
  });

  const card = await view.findByRole("region", { name: "Checkout readiness" });
  assert.ok(view.getByText("Review my Cart for checkout"));
  assert.ok(testingLibrary.within(card).getByText("Ready for checkout"));
  assert.ok(testingLibrary.within(card).getByText("Evaluated at Cart version 4"));
  assert.ok(await testingLibrary.within(card).findByText("Outdated"));
});

test("a blocked readiness card withholds its Cart controls while the current Cart is unknown", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  installBrowser(dom);
  const [testingLibrary, { ShoppingAssistant }] = await Promise.all([
    import("@testing-library/react"),
    import("./shopping-assistant"),
  ]);
  const view = testingLibrary.render(
    React.createElement(ShoppingAssistant, {
      brandName: "Arc",
      brandDescription: "Everyday footwear and accessories.",
      initialConversation: {
        conversationId: "41000000-0000-4000-8000-000000000001",
        transcript: [readinessEntry(shortStockReadiness)],
        contextSummary: createEmptyConversationContext().productConstraints,
        revision: 1,
      },
    }),
  );
  t.after(() => {
    testingLibrary.cleanup();
    dom.window.close();
  });

  const card = view.getByRole("region", { name: "Checkout readiness" });
  assert.ok(
    testingLibrary
      .within(card)
      .getByText(
        "Quiet Buds only has 1 unit in stock. Reduce the quantity to 1, or remove it from the Cart.",
      ),
  );
  assert.equal(testingLibrary.within(card).queryAllByRole("button").length, 0);
});

const mispricedReadiness: CheckoutReadiness = {
  status: "NOT_READY",
  cart: { ...oversubscribedCart, currency: "USD" },
  blockers: [
    {
      code: "CURRENCY_UNSUPPORTED",
      message:
        "This Cart is priced in USD, but the Storefront supports Indian rupees (INR) only. It cannot be reviewed for checkout.",
    },
  ],
};

test("a Cart priced outside Indian rupees renders a not-ready card explaining the currency", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  const { view, within, user, review } = await reviewTheCart(
    t,
    dom,
    oversubscribedCart,
    () => Response.json({ data: readinessEntry(mispricedReadiness) }),
  );

  await user.click(review);

  const card = await view.findByRole("region", { name: "Checkout readiness" });
  assert.ok(within(card).getByText("Not ready for checkout"));
  assert.ok(
    within(card).getByText(
      "This Cart is priced in USD, but the Storefront supports Indian rupees (INR) only. It cannot be reviewed for checkout.",
    ),
  );
});
