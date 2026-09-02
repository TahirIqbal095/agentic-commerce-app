import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import type { AgentOutcome } from "@/modules/agent/agent-outcome";
import type { CartView } from "@/modules/cart/cart";
import { createEmptyConversationContext } from "@/modules/agent/intent";

function installBrowser(dom: JSDOM) {
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    getComputedStyle: dom.window.getComputedStyle,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: dom.window.navigator,
  });
  Object.defineProperties(dom.window, {
    requestAnimationFrame: {
      configurable: true,
      value: (callback: FrameRequestCallback) =>
        setTimeout(() => callback(Date.now()), 0),
    },
    cancelAnimationFrame: { configurable: true, value: clearTimeout },
    matchMedia: {
      configurable: true,
      value: () => ({
        matches: false,
        media: "",
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {
          return false;
        },
      }),
    },
    scrollTo: { configurable: true, value() {} },
  });
  Object.assign(dom.window.HTMLElement.prototype, {
    hasPointerCapture() {
      return false;
    },
    setPointerCapture() {},
    releasePointerCapture() {},
  });
}

test("Customer increments one Cart Item without optimistic commercial changes", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  installBrowser(dom);
  const productId = "11000000-0000-4000-8000-000000000001";
  const currentCart = {
    id: "31000000-0000-4000-8000-000000000001",
    version: 1,
    items: [
      {
        productId,
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
  let resolveIncrement!: (response: Response) => void;
  const incrementResponse = new Promise<Response>((resolve) => {
    resolveIncrement = resolve;
  });
  const requests: Array<[string, RequestInit | undefined]> = [];
  globalThis.fetch = async (input, init) => {
    requests.push([String(input), init]);
    if (input === "/api/agent/conversation") {
      return Response.json({ data: null });
    }
    if (input === "/api/cart" && !init?.method) {
      return Response.json({ data: currentCart });
    }
    if (input === "/api/cart" && init?.method === "PATCH") {
      return incrementResponse;
    }
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${input}`);
  };

  const [{ render, cleanup, within }, userEvent, { ShoppingAssistant }] =
    await Promise.all([
      import("@testing-library/react"),
      import("@testing-library/user-event").then((module) => module.default),
      import("./shopping-assistant"),
    ]);
  const view = render(
    React.createElement(ShoppingAssistant, {
      brandName: "Arc",
      resumeConversation: true,
    }),
  );
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const user = userEvent.setup({ document: dom.window.document });

  await user.click(await view.findByRole("button", { name: "Cart · 2" }));
  const drawer = view.getByRole("dialog", { name: "Your Cart" });
  const cart = within(drawer);
  const increment = cart.getByRole("button", {
    name: "Increase Quiet Buds quantity",
  });
  const decrement = cart.getByRole("button", {
    name: "Decrease Quiet Buds quantity",
  });
  const remove = cart.getByRole("button", {
    name: "Remove Quiet Buds from Cart",
  });

  await user.click(increment);

  assert.equal(increment.hasAttribute("disabled"), true);
  assert.equal(decrement.hasAttribute("disabled"), false);
  assert.equal(remove.hasAttribute("disabled"), false);
  assert.ok(cart.getByText("2 × ₹3,499"));
  assert.equal(cart.getAllByText("₹6,998").length, 2);
  assert.equal(
    dom.window.document.querySelector('button[aria-label="Cart · 2"]')
      ?.textContent,
    "Cart · 2",
  );

  resolveIncrement(
    Response.json({
      data: {
        ...currentCart,
        version: 2,
        items: [
          {
            ...currentCart.items[0],
            quantity: 3,
            subtotalMinor: 1049700,
          },
        ],
        totalQuantity: 3,
        subtotalMinor: 1049700,
      },
    }),
  );

  assert.ok(await cart.findByText("3 × ₹3,499"));
  assert.equal(cart.getAllByText("₹10,497").length, 2);
  assert.equal(
    dom.window.document.querySelector('button[aria-label="Cart · 3"]')
      ?.textContent,
    "Cart · 3",
  );
  const mutation = requests.find(([, init]) => init?.method === "PATCH");
  assert.ok(mutation);
  assert.deepEqual(JSON.parse(String(mutation[1]?.body)), {
    type: "INCREMENT_ITEM",
    productId,
    mutationKey: JSON.parse(String(mutation[1]?.body)).mutationKey,
    expectedVersion: 1,
  });
  assert.match(
    JSON.parse(String(mutation[1]?.body)).mutationKey,
    /^[0-9a-f-]{36}$/,
  );
});

test("a Cart command failure reloads the authoritative Cart and shows an Item-level reason", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  installBrowser(dom);
  const productId = "11000000-0000-4000-8000-000000000001";
  const currentCart = {
    id: "31000000-0000-4000-8000-000000000001",
    version: 1,
    items: [
      {
        productId,
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
  const reconciledCart = {
    ...currentCart,
    version: 2,
    items: [{ ...currentCart.items[0], quantity: 1, subtotalMinor: 349900 }],
    totalQuantity: 1,
    subtotalMinor: 349900,
  };
  let cartReads = 0;
  globalThis.fetch = async (input, init) => {
    if (input === "/api/agent/conversation") {
      return Response.json({ data: null });
    }
    if (input === "/api/cart" && !init?.method) {
      cartReads += 1;
      return Response.json({
        data: cartReads === 1 ? currentCart : reconciledCart,
      });
    }
    if (input === "/api/cart" && init?.method === "PATCH") {
      return Response.json(
        {
          error: {
            code: "CART_UNAVAILABLE",
            message: "The Cart command response was lost.",
          },
        },
        { status: 500 },
      );
    }
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${input}`);
  };

  const [{ render, cleanup, within }, userEvent, { ShoppingAssistant }] =
    await Promise.all([
      import("@testing-library/react"),
      import("@testing-library/user-event").then((module) => module.default),
      import("./shopping-assistant"),
    ]);
  const view = render(
    React.createElement(ShoppingAssistant, {
      brandName: "Arc",
      resumeConversation: true,
    }),
  );
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const user = userEvent.setup({ document: dom.window.document });

  await user.click(await view.findByRole("button", { name: "Cart · 2" }));
  const drawer = view.getByRole("dialog", { name: "Your Cart" });
  const cart = within(drawer);
  await user.click(
    cart.getByRole("button", { name: "Increase Quiet Buds quantity" }),
  );

  assert.equal(
    (await cart.findByRole("alert")).textContent,
    "The Cart command response was lost.",
  );
  assert.equal(cartReads, 2);
  assert.ok(cart.getByText("1 × ₹3,499"));
  assert.equal(
    dom.window.document.querySelector('button[aria-label="Cart · 1"]')
      ?.textContent,
    "Cart · 1",
  );
  assert.equal(
    cart
      .getByRole("button", { name: "Increase Quiet Buds quantity" })
      .hasAttribute("disabled"),
    false,
  );
});

test("Customer explicitly removes the final Cart Item", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  installBrowser(dom);
  const productId = "11000000-0000-4000-8000-000000000001";
  const currentCart = {
    id: "31000000-0000-4000-8000-000000000001",
    version: 1,
    items: [
      {
        productId,
        productName: "Quiet Buds",
        quantity: 1,
        cartPriceMinor: 349900,
        subtotalMinor: 349900,
      },
    ],
    totalQuantity: 1,
    subtotalMinor: 349900,
    currency: "INR",
  };
  const removeRequest: { body: Record<string, string> | null } = { body: null };
  globalThis.fetch = async (input, init) => {
    if (input === "/api/agent/conversation") {
      return Response.json({ data: null });
    }
    if (input === "/api/cart" && !init?.method) {
      return Response.json({ data: currentCart });
    }
    if (input === "/api/cart" && init?.method === "DELETE") {
      removeRequest.body = JSON.parse(String(init.body)) as Record<
        string,
        string
      >;
      return Response.json({
        data: {
          ...currentCart,
          version: 2,
          items: [],
          totalQuantity: 0,
          subtotalMinor: 0,
        },
      });
    }
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${input}`);
  };

  const [{ render, cleanup, within }, userEvent, { ShoppingAssistant }] =
    await Promise.all([
      import("@testing-library/react"),
      import("@testing-library/user-event").then((module) => module.default),
      import("./shopping-assistant"),
    ]);
  const view = render(
    React.createElement(ShoppingAssistant, {
      brandName: "Arc",
      resumeConversation: true,
    }),
  );
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const user = userEvent.setup({ document: dom.window.document });

  await user.click(await view.findByRole("button", { name: "Cart · 1" }));
  const drawer = view.getByRole("dialog", { name: "Your Cart" });
  await user.click(
    within(drawer).getByRole("button", {
      name: "Remove Quiet Buds from Cart",
    }),
  );

  assert.ok(await within(drawer).findByText("Your Cart is empty."));
  assert.equal(
    dom.window.document.querySelector('button[aria-label="Cart · 0"]')
      ?.textContent,
    "Cart · 0",
  );
  assert.ok(removeRequest.body);
  assert.equal(removeRequest.body.type, "REMOVE_ITEM");
  assert.equal(removeRequest.body.productId, productId);
  assert.equal(removeRequest.body.expectedVersion, 1);
  assert.match(removeRequest.body.mutationKey, /^[0-9a-f-]{36}$/);
});

test("historical Cart Summaries in the Conversation remain read-only", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  installBrowser(dom);
  const constraints = createEmptyConversationContext().productConstraints;
  const [{ render, cleanup, within }, { ShoppingAssistant }] =
    await Promise.all([
      import("@testing-library/react"),
      import("./shopping-assistant"),
    ]);
  const view = render(
    React.createElement(ShoppingAssistant, {
      brandName: "Arc",
      initialConversation: {
        conversationId: "41000000-0000-4000-8000-000000000001",
        transcript: [
          {
            id: "51000000-0000-4000-8000-000000000001",
            customerMessage: "What's in my Cart?",
            result: {
              status: "COMPLETED",
              conversationId: "41000000-0000-4000-8000-000000000001",
              message: "Here’s what’s in your Cart.",
              intentBrief: {
                goal: "Inspect Cart",
                constraints,
                knownEntities: [],
                missingInformation: [],
                confidence: 1,
                requestedEffects: ["INSPECT_CART"],
              },
              products: [],
              cart: {
                id: "31000000-0000-4000-8000-000000000001",
                version: 1,
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
              },
            },
            error: null,
          },
        ],
        contextSummary: constraints,
        revision: 1,
      },
    }),
  );
  t.after(() => {
    cleanup();
    dom.window.close();
  });

  const summary = view.getByRole("region", { name: "Your Cart" });
  assert.ok(within(summary).getByText("2 × ₹3,499"));
  assert.equal(within(summary).queryAllByRole("button").length, 0);
});

function cartInspectionTurn(
  message: string,
  cart: CartView,
): AgentOutcome & { status: "COMPLETED" } {
  return {
    status: "COMPLETED",
    conversationId: "41000000-0000-4000-8000-000000000001",
    message,
    intentBrief: {
      goal: "Inspect Cart",
      constraints: createEmptyConversationContext().productConstraints,
      knownEntities: [],
      missingInformation: [],
      confidence: 1,
      requestedEffects: ["INSPECT_CART"],
    },
    products: [],
    cart,
  };
}

async function askAboutTheCart(
  t: TestContext,
  dom: JSDOM,
  agentResponse: () => Response,
) {
  installBrowser(dom);
  globalThis.fetch = async (input, init) => {
    if (input === "/api/agent/conversation") return Response.json({ data: null });
    if (input === "/api/cart" && !init?.method) {
      return Response.json({
        data: {
          id: null,
          version: 0,
          items: [],
          totalQuantity: 0,
          subtotalMinor: 0,
          currency: "INR",
        },
      });
    }
    if (input === "/api/agent/message") return agentResponse();
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${input}`);
  };

  const [testingLibrary, userEvent, { ShoppingAssistant }] = await Promise.all([
    import("@testing-library/react"),
    import("@testing-library/user-event").then((module) => module.default),
    import("./shopping-assistant"),
  ]);
  const view = testingLibrary.render(
    React.createElement(ShoppingAssistant, {
      brandName: "Arc",
      resumeConversation: true,
    }),
  );
  t.after(() => {
    testingLibrary.cleanup();
    dom.window.close();
  });

  const user = userEvent.setup({ document: dom.window.document });
  await user.type(
    view.getByRole("textbox", { name: /message/i }),
    "What is in my Cart?",
  );
  await user.click(view.getByRole("button", { name: /send/i }));
  return { view, within: testingLibrary.within };
}

test("a Cart inspection renders authoritative Items, Cart Prices, and Cart Subtotal", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  const { view, within } = await askAboutTheCart(t, dom, () =>
    Response.json({
      data: cartInspectionTurn("Here’s what’s in your Cart.", {
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
      }),
    }),
  );

  const summary = within(await view.findByRole("region", { name: "Your Cart" }));
  assert.ok(summary.getByText("Quiet Buds"));
  assert.ok(summary.getByText("2 × ₹3,499"));
  assert.ok(summary.getByText("Trail Runner"));
  assert.ok(summary.getByText("1 × ₹8,999"));
  assert.equal(
    summary.getByLabelText("Quiet Buds subtotal").textContent,
    "₹6,998",
  );
  assert.ok(summary.getByText("Cart Subtotal"));
  assert.ok(summary.getByText("₹15,997"));
  assert.equal(summary.queryAllByRole("button").length, 0);
});

test("every commercial value on screen comes from the structured Cart", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  const { view, within } = await askAboutTheCart(t, dom, () =>
    Response.json({
      data: cartInspectionTurn("Here\u2019s what\u2019s in your Cart.", {
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
      }),
    }),
  );

  const summary = within(await view.findByRole("region", { name: "Your Cart" }));
  assert.equal(
    summary.getByLabelText("Quiet Buds subtotal").textContent,
    "\u20b96,998",
  );
  assert.equal(
    summary.getByLabelText("Cart Subtotal").textContent,
    "\u20b96,998",
  );
  assert.deepEqual(
    dom.window.document.body.textContent?.match(/\u20b9[\d,]+/g),
    ["\u20b93,499", "\u20b96,998", "\u20b96,998"],
  );
  assert.ok(await view.findByRole("button", { name: "Cart \u00b7 2" }));
});

test("an unrelated Conversation Turn renders no Cart Summary", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  const { view } = await askAboutTheCart(t, dom, () =>
    Response.json({
      data: {
        status: "COMPLETED",
        conversationId: "41000000-0000-4000-8000-000000000001",
        message: "Here are two running shoes.",
        intentBrief: {
          goal: "Find running shoes",
          constraints: createEmptyConversationContext().productConstraints,
          knownEntities: [],
          missingInformation: [],
          confidence: 1,
          requestedEffects: ["DISCOVER_PRODUCTS"],
        },
        products: [],
      },
    }),
  );

  assert.ok(await view.findByText("Here are two running shoes."));
  assert.equal(view.queryByRole("region", { name: "Your Cart" }), null);
});

test("an empty Cart inspection renders an explicit empty Cart Summary", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  const { view, within } = await askAboutTheCart(t, dom, () =>
    Response.json({
      data: cartInspectionTurn("Your Cart is empty.", {
        id: null,
        version: 0,
        items: [],
        totalQuantity: 0,
        subtotalMinor: 0,
        currency: "INR",
      }),
    }),
  );

  const summary = within(await view.findByRole("region", { name: "Your Cart" }));
  assert.ok(summary.getByText("Your Cart is empty."));
  assert.ok(summary.getByText("0 units"));
  assert.ok(summary.getByText("Cart Subtotal"));
  assert.ok(summary.getByText("₹0"));
});

test("a failed Cart inspection shows a retryable reason and no Cart values", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  const { view } = await askAboutTheCart(t, dom, () =>
    Response.json({
      data: {
        status: "TEMPORARILY_UNAVAILABLE",
        conversationId: "41000000-0000-4000-8000-000000000001",
        message: "I couldn't read your Cart right now. Please try again.",
        retryable: true,
        products: [],
      },
    }),
  );

  assert.ok(
    await view.findByText("I couldn't read your Cart right now. Please try again."),
  );
  assert.equal(view.queryByRole("region", { name: "Your Cart" }), null);
});

test("retrying a timed-out Cart command reuses its mutation key", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  installBrowser(dom);
  const productId = "11000000-0000-4000-8000-000000000001";
  const currentCart = {
    id: "31000000-0000-4000-8000-000000000001",
    version: 1,
    items: [
      {
        productId,
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
  const appliedCart = {
    ...currentCart,
    version: 2,
    items: [{ ...currentCart.items[0], quantity: 3, subtotalMinor: 1049700 }],
    totalQuantity: 3,
    subtotalMinor: 1049700,
  };
  const incrementKeys: string[] = [];
  globalThis.fetch = async (input, init) => {
    if (input === "/api/agent/conversation") {
      return Response.json({ data: null });
    }
    if (input === "/api/cart" && !init?.method) {
      return Response.json({ data: currentCart });
    }
    if (input === "/api/cart" && init?.method === "PATCH") {
      incrementKeys.push(JSON.parse(String(init.body)).mutationKey);
      if (incrementKeys.length === 1) {
        throw new TypeError("Failed to fetch");
      }
      return Response.json({ data: appliedCart });
    }
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${input}`);
  };

  const [{ render, cleanup, within }, userEvent, { ShoppingAssistant }] =
    await Promise.all([
      import("@testing-library/react"),
      import("@testing-library/user-event").then((module) => module.default),
      import("./shopping-assistant"),
    ]);
  const view = render(
    React.createElement(ShoppingAssistant, {
      brandName: "Arc",
      resumeConversation: true,
    }),
  );
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const user = userEvent.setup({ document: dom.window.document });

  await user.click(await view.findByRole("button", { name: "Cart · 2" }));
  const cart = within(view.getByRole("dialog", { name: "Your Cart" }));
  const increment = cart.getByRole("button", {
    name: "Increase Quiet Buds quantity",
  });

  await user.click(increment);
  await cart.findByRole("alert");
  await user.click(
    cart.getByRole("button", { name: "Increase Quiet Buds quantity" }),
  );

  assert.ok(await cart.findByText("3 × ₹3,499"));
  assert.equal(incrementKeys.length, 2);
  assert.equal(incrementKeys[0], incrementKeys[1]);
});

test("a Cart command answered with a conflict starts the next command with a new key", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  installBrowser(dom);
  const productId = "11000000-0000-4000-8000-000000000001";
  const currentCart = {
    id: "31000000-0000-4000-8000-000000000001",
    version: 1,
    items: [
      {
        productId,
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
  const authoritativeCart = {
    ...currentCart,
    version: 6,
    items: [{ ...currentCart.items[0], quantity: 5, subtotalMinor: 1749500 }],
    totalQuantity: 5,
    subtotalMinor: 1749500,
  };
  const incrementCommands: Array<{
    mutationKey: string;
    expectedVersion: number;
  }> = [];
  globalThis.fetch = async (input, init) => {
    if (input === "/api/agent/conversation") {
      return Response.json({ data: null });
    }
    if (input === "/api/cart" && !init?.method) {
      return Response.json({ data: currentCart });
    }
    if (input === "/api/cart" && init?.method === "PATCH") {
      incrementCommands.push(JSON.parse(String(init.body)));
      if (incrementCommands.length === 1) {
        return Response.json(
          {
            error: {
              code: "CART_CONFLICT",
              message:
                "The Cart changed in another tab. Reload the Cart and try again.",
              details: { cart: authoritativeCart },
            },
          },
          { status: 409 },
        );
      }
      return Response.json({
        data: {
          ...authoritativeCart,
          version: 7,
          items: [
            { ...authoritativeCart.items[0], quantity: 6, subtotalMinor: 2099400 },
          ],
          totalQuantity: 6,
          subtotalMinor: 2099400,
        },
      });
    }
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${input}`);
  };

  const [{ render, cleanup, within }, userEvent, { ShoppingAssistant }] =
    await Promise.all([
      import("@testing-library/react"),
      import("@testing-library/user-event").then((module) => module.default),
      import("./shopping-assistant"),
    ]);
  const view = render(
    React.createElement(ShoppingAssistant, {
      brandName: "Arc",
      resumeConversation: true,
    }),
  );
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const user = userEvent.setup({ document: dom.window.document });

  await user.click(await view.findByRole("button", { name: "Cart · 2" }));
  const cart = within(view.getByRole("dialog", { name: "Your Cart" }));

  await user.click(
    cart.getByRole("button", { name: "Increase Quiet Buds quantity" }),
  );

  assert.equal(
    (await cart.findByRole("alert")).textContent,
    "The Cart changed in another tab. Reload the Cart and try again.",
  );
  assert.ok(cart.getByText("5 × ₹3,499"));
  assert.equal(
    dom.window.document.querySelector('button[aria-label="Cart · 5"]')
      ?.textContent,
    "Cart · 5",
  );

  await user.click(
    cart.getByRole("button", { name: "Increase Quiet Buds quantity" }),
  );

  assert.ok(await cart.findByText("6 × ₹3,499"));
  assert.equal(incrementCommands.length, 2);
  assert.notEqual(
    incrementCommands[0].mutationKey,
    incrementCommands[1].mutationKey,
  );
  assert.equal(incrementCommands[0].expectedVersion, 1);
  assert.equal(incrementCommands[1].expectedVersion, 6);
});

test("retrying a failed Add reuses its mutation key instead of adding twice", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  installBrowser(dom);
  const productId = "11000000-0000-4000-8000-000000000001";
  const emptyCart = {
    id: null,
    version: 0,
    items: [],
    totalQuantity: 0,
    subtotalMinor: 0,
    currency: "INR",
  };
  const addedCart = {
    id: "31000000-0000-4000-8000-000000000001",
    version: 1,
    items: [
      {
        productId,
        productName: "StrideFlow Daily Running Shoes",
        quantity: 1,
        cartPriceMinor: 399900,
        subtotalMinor: 399900,
      },
    ],
    totalQuantity: 1,
    subtotalMinor: 399900,
    currency: "INR",
  };
  const outcome: AgentOutcome = {
    status: "COMPLETED",
    conversationId: "41000000-0000-4000-8000-000000000001",
    message: "Here is one option.",
    intentBrief: {
      goal: "Find running shoes",
      constraints: createEmptyConversationContext().productConstraints,
      knownEntities: [],
      missingInformation: [],
      confidence: 1,
      requestedEffects: [],
    },
    products: [
      {
        id: productId,
        slug: "strideflow-daily-running-shoes",
        name: "StrideFlow Daily Running Shoes",
        description: "Everyday road running shoes.",
        category: "Running Shoes",
        priceMinor: 399900,
        currency: "INR",
        inStock: true,
        attributes: {},
      },
    ],
  };
  const addKeys: string[] = [];
  const turnKeys: string[] = [];
  globalThis.fetch = async (input, init) => {
    if (input === "/api/agent/conversation") {
      return Response.json({ data: null });
    }
    if (input === "/api/agent/message") {
      turnKeys.push(JSON.parse(String(init?.body)).idempotencyKey);
      return Response.json({ data: outcome });
    }
    if (input === "/api/cart" && !init?.method) {
      return Response.json({ data: emptyCart });
    }
    if (input === "/api/cart" && init?.method === "POST") {
      addKeys.push(JSON.parse(String(init.body)).mutationKey);
      if (addKeys.length === 1) throw new TypeError("Failed to fetch");
      return Response.json({ data: addedCart });
    }
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${input}`);
  };

  const [{ render, cleanup }, userEvent, { ShoppingAssistant }] =
    await Promise.all([
      import("@testing-library/react"),
      import("@testing-library/user-event").then((module) => module.default),
      import("./shopping-assistant"),
    ]);
  const view = render(
    React.createElement(ShoppingAssistant, {
      brandName: "Arc",
      resumeConversation: true,
    }),
  );
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const user = userEvent.setup({ document: dom.window.document });

  const addLabel = "Add StrideFlow Daily Running Shoes to Cart";
  await user.type(
    view.getByRole("textbox", { name: /message/i }),
    "running shoes",
  );
  await user.click(view.getByRole("button", { name: /send/i }));

  await user.click(await view.findByRole("button", { name: addLabel }));
  await view.findByText(/Failed to fetch/i);
  await user.click(view.getByRole("button", { name: addLabel }));

  await view.findByText(/quantity: 1/i);
  assert.equal(addKeys.length, 2);
  assert.equal(addKeys[0], addKeys[1]);
  assert.equal(turnKeys.length, 1);
  assert.equal(turnKeys.includes(addKeys[0]), false);
});

test("a conflict replaces stale drawer and badge state even when the authoritative Cart is emptier", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  installBrowser(dom);
  const productId = "11000000-0000-4000-8000-000000000001";
  const staleCart = {
    id: "31000000-0000-4000-8000-000000000001",
    version: 4,
    items: [
      {
        productId,
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
  const authoritativeCart = {
    id: null,
    version: 0,
    items: [],
    totalQuantity: 0,
    subtotalMinor: 0,
    currency: "INR",
  };
  globalThis.fetch = async (input, init) => {
    if (input === "/api/agent/conversation") {
      return Response.json({ data: null });
    }
    if (input === "/api/cart" && !init?.method) {
      return Response.json({ data: staleCart });
    }
    if (input === "/api/cart" && init?.method === "PATCH") {
      return Response.json(
        {
          error: {
            code: "CART_CONFLICT",
            message: "The Cart Item is no longer in the Cart.",
            details: { cart: authoritativeCart },
          },
        },
        { status: 409 },
      );
    }
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${input}`);
  };

  const [{ render, cleanup, within }, userEvent, { ShoppingAssistant }] =
    await Promise.all([
      import("@testing-library/react"),
      import("@testing-library/user-event").then((module) => module.default),
      import("./shopping-assistant"),
    ]);
  const view = render(
    React.createElement(ShoppingAssistant, {
      brandName: "Arc",
      resumeConversation: true,
    }),
  );
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const user = userEvent.setup({ document: dom.window.document });

  await user.click(await view.findByRole("button", { name: "Cart · 2" }));
  const cart = within(view.getByRole("dialog", { name: "Your Cart" }));

  await user.click(
    cart.getByRole("button", { name: "Increase Quiet Buds quantity" }),
  );

  assert.ok(await cart.findByText("Your Cart is empty."));
  assert.equal(cart.queryByText("2 × ₹3,499"), null);
  assert.equal(
    dom.window.document.querySelector('button[aria-label="Cart · 0"]')
      ?.textContent,
    "Cart · 0",
  );
});

test("a Cart rule rejection never rolls the drawer back to an older Cart", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  installBrowser(dom);
  const productId = "11000000-0000-4000-8000-000000000001";
  const currentCart = {
    id: "31000000-0000-4000-8000-000000000001",
    version: 4,
    items: [
      {
        productId,
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
  const olderCart = {
    ...currentCart,
    version: 3,
    items: [{ ...currentCart.items[0], quantity: 1, subtotalMinor: 349900 }],
    totalQuantity: 1,
    subtotalMinor: 349900,
  };
  let cartReads = 0;
  globalThis.fetch = async (input, init) => {
    if (input === "/api/agent/conversation") {
      return Response.json({ data: null });
    }
    if (input === "/api/cart" && !init?.method) {
      cartReads += 1;
      return Response.json({ data: currentCart });
    }
    if (input === "/api/cart" && init?.method === "PATCH") {
      return Response.json(
        {
          error: {
            code: "CART_RULE_REJECTED",
            message: "Quiet Buds only has 2 units in stock.",
            details: { cart: olderCart },
          },
        },
        { status: 409 },
      );
    }
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${input}`);
  };

  const [{ render, cleanup, within }, userEvent, { ShoppingAssistant }] =
    await Promise.all([
      import("@testing-library/react"),
      import("@testing-library/user-event").then((module) => module.default),
      import("./shopping-assistant"),
    ]);
  const view = render(
    React.createElement(ShoppingAssistant, {
      brandName: "Arc",
      resumeConversation: true,
    }),
  );
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const user = userEvent.setup({ document: dom.window.document });

  await user.click(await view.findByRole("button", { name: "Cart · 2" }));
  const cart = within(view.getByRole("dialog", { name: "Your Cart" }));

  await user.click(
    cart.getByRole("button", { name: "Increase Quiet Buds quantity" }),
  );

  assert.equal(
    (await cart.findByRole("alert")).textContent,
    "Quiet Buds only has 2 units in stock.",
  );
  assert.ok(cart.getByText("2 × ₹3,499"));
  assert.equal(cart.queryByText("1 × ₹3,499"), null);
  assert.equal(
    dom.window.document.querySelector('button[aria-label="Cart · 2"]')
      ?.textContent,
    "Cart · 2",
  );
  assert.equal(cartReads, 1);
});

test("a replayed retry frees its key so the next Customer action still applies", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  installBrowser(dom);
  const productId = "11000000-0000-4000-8000-000000000001";
  const cartAtQuantity = (quantity: number, version: number) => ({
    id: "31000000-0000-4000-8000-000000000001",
    version,
    items: [
      {
        productId,
        productName: "Quiet Buds",
        quantity,
        cartPriceMinor: 349900,
        subtotalMinor: quantity * 349900,
      },
    ],
    totalQuantity: quantity,
    subtotalMinor: quantity * 349900,
    currency: "INR",
  });
  const keys: string[] = [];
  globalThis.fetch = async (input, init) => {
    if (input === "/api/agent/conversation") {
      return Response.json({ data: null });
    }
    if (input === "/api/cart" && !init?.method) {
      // The lost command had in fact been applied before its response vanished.
      return Response.json({
        data: keys.length === 0 ? cartAtQuantity(2, 1) : cartAtQuantity(3, 2),
      });
    }
    if (input === "/api/cart" && init?.method === "PATCH") {
      keys.push(JSON.parse(String(init.body)).mutationKey);
      if (keys.length === 1) throw new TypeError("Failed to fetch");
      // The retry replays the stored result; a later command applies afresh.
      return Response.json({
        data: keys.length === 2 ? cartAtQuantity(3, 2) : cartAtQuantity(4, 3),
      });
    }
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${input}`);
  };

  const [{ render, cleanup, within }, userEvent, { ShoppingAssistant }] =
    await Promise.all([
      import("@testing-library/react"),
      import("@testing-library/user-event").then((module) => module.default),
      import("./shopping-assistant"),
    ]);
  const view = render(
    React.createElement(ShoppingAssistant, {
      brandName: "Arc",
      resumeConversation: true,
    }),
  );
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const user = userEvent.setup({ document: dom.window.document });

  await user.click(await view.findByRole("button", { name: "Cart · 2" }));
  const cart = within(view.getByRole("dialog", { name: "Your Cart" }));
  const increase = () =>
    cart.getByRole("button", { name: "Increase Quiet Buds quantity" });

  await user.click(increase());
  await cart.findByRole("alert");
  await user.click(increase());
  assert.ok(await cart.findByText("3 × ₹3,499"));
  await user.click(increase());

  assert.ok(await cart.findByText("4 × ₹3,499"));
  assert.equal(keys.length, 3);
  assert.equal(keys[0], keys[1]);
  assert.notEqual(keys[1], keys[2]);
});
