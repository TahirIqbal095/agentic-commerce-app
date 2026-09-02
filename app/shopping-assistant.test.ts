import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
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
