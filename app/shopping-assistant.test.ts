import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React from "react";

test("customer sees the configured Brand in the Storefront", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  const [{ render, cleanup }, { ShoppingAssistant }] = await Promise.all([
    import("@testing-library/react"),
    import("./shopping-assistant"),
  ]);

  const view = render(
    React.createElement(ShoppingAssistant, { brandName: "Northstar" }),
  );
  t.after(() => {
    cleanup();
    dom.window.close();
  });

  assert.equal(view.getByText("Northstar").textContent, "Northstar");
  assert.equal(
    view.getByText("Searches Northstar's live Catalog").textContent,
    "Searches Northstar's live Catalog",
  );
});

test("customer can read one Commerce Agent progress update beside their submitted request", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: dom.window.navigator,
  });

  globalThis.fetch = async () => new Promise<Response>(() => undefined);

  const [{ render, cleanup }, userEvent, { ShoppingAssistant }] =
    await Promise.all([
      import("@testing-library/react"),
      import("@testing-library/user-event").then((module) => module.default),
      import("./shopping-assistant"),
    ]);

  const view = render(
    React.createElement(ShoppingAssistant, { brandName: "Arc" }),
  );
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const user = userEvent.setup({ document: dom.window.document });
  const composer = view.getByRole("textbox", {
    name: "Message the Arc Commerce Agent",
  });

  await user.type(composer, "A minimal desk upgrade");
  await user.click(view.getByRole("button", { name: "Send" }));

  assert.equal(view.getByText("You").textContent, "You");
  assert.equal(
    view.getByText("A minimal desk upgrade").textContent,
    "A minimal desk upgrade",
  );
  assert.equal(view.getByText("Commerce Agent").textContent, "Commerce Agent");
  assert.equal(
    view.getByText("Understanding your request").getAttribute("aria-current"),
    "step",
  );
  assert.equal(view.queryByText("Searching the live catalog"), null);
  assert.equal(view.queryByText("Comparing the strongest matches"), null);
  assert.equal(view.queryByText("Preparing your shortlist"), null);
});

test("customer can submit a request and read product results above the persistent composer", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: dom.window.navigator,
  });

  const fetchCalls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  globalThis.fetch = async (input, init) => {
    fetchCalls.push([input, init]);
    return new Response(
      JSON.stringify({
        data: {
          status: "COMPLETED",
          conversationId: "41000000-0000-4000-8000-000000000001",
          message: "I found one precise match.",
          intentBrief: {
            goal: "Find noise-cancelling earphones",
            constraints: {
              productTypes: ["earphones"],
              useCases: [],
              features: ["noise cancelling"],
              category: "Audio",
              minPriceMinor: null,
              maxPriceMinor: 500000,
              size: null,
              inStockOnly: true,
              attributes: {},
            },
            knownEntities: [{ type: "PRODUCT_TYPE", value: "earphones" }],
            missingInformation: [],
            confidence: 0.95,
            requestedEffects: ["DISCOVER_PRODUCTS"],
          },
          products: [
            {
              id: "product-1",
              name: "Quiet Buds",
              description: "Compact wireless earphones.",
              category: "Audio",
              priceMinor: 349900,
              currency: "INR",
              inStock: true,
            },
          ],
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const [{ render, cleanup }, userEvent, { ShoppingAssistant }] =
    await Promise.all([
      import("@testing-library/react"),
      import("@testing-library/user-event").then((module) => module.default),
      import("./shopping-assistant"),
    ]);

  const view = render(
    React.createElement(ShoppingAssistant, { brandName: "Arc" }),
  );
  const user = userEvent.setup({ document: dom.window.document });
  const composer = view.getByRole("textbox", {
    name: "Message the Arc Commerce Agent",
  });

  assert.equal(composer.tagName, "TEXTAREA");
  await user.type(composer, "noise cancelling earphones under 5000");
  await user.click(view.getByRole("button", { name: "Send" }));

  const product = await view.findByRole("heading", { name: "Quiet Buds" });
  const form = composer.closest("form");

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0]?.[0], "/api/agent/message");
  assert.deepEqual(JSON.parse(String(fetchCalls[0]?.[1]?.body)), {
    message: "noise cancelling earphones under 5000",
  });
  assert.ok(form);
  assert.equal(
    product.compareDocumentPosition(form) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
    dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
  );
  assert.equal(view.getByText("I found one precise match.").textContent, "I found one precise match.");
  assert.equal(
    view.getByText("noise cancelling").textContent?.trim(),
    "noise cancelling",
  );
  assert.equal((composer as HTMLInputElement).value, "");

  cleanup();
  dom.window.close();
});

test("customer can request and read the details of a product", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: dom.window.navigator,
  });

  const detailRequests: string[] = [];
  globalThis.fetch = async (input) => {
    if (input === "/api/agent/message") {
      return new Response(
        JSON.stringify({
          data: {
            message: "I found one precise match.",
            products: [
              {
                id: "product-1",
                slug: "quiet-buds",
                name: "Quiet Buds",
                description: "Compact wireless earphones.",
                category: "Audio",
                priceMinor: 349900,
                currency: "INR",
                inStock: true,
                attributes: {},
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    detailRequests.push(String(input));
    return new Response(
      JSON.stringify({
        data: {
          id: "product-1",
          slug: "quiet-buds",
          name: "Quiet Buds",
          description:
            "Compact wireless earphones with active noise cancellation.",
          category: "Audio",
          priceMinor: 349900,
          currency: "INR",
          inStock: true,
          attributes: {
            batteryLife: "30 hours",
            colors: ["Black", "Sand"],
          },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const [{ render, cleanup, within }, userEvent, { ShoppingAssistant }] =
    await Promise.all([
      import("@testing-library/react"),
      import("@testing-library/user-event").then((module) => module.default),
      import("./shopping-assistant"),
    ]);

  const view = render(
    React.createElement(ShoppingAssistant, { brandName: "Arc" }),
  );
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const user = userEvent.setup({ document: dom.window.document });

  await user.type(
    view.getByRole("textbox", { name: "Message the Arc Commerce Agent" }),
    "noise cancelling earphones",
  );
  await user.click(view.getByRole("button", { name: "Send" }));
  await user.click(
    await view.findByRole("button", { name: "View Quiet Buds" }),
  );

  const details = await view.findByRole("dialog", {
    name: "Quiet Buds details",
  });
  const detailView = within(details);

  assert.deepEqual(detailRequests, ["/api/products/product-1"]);
  assert.equal(
    detailView.getByText(
      "Compact wireless earphones with active noise cancellation.",
    ).textContent,
    "Compact wireless earphones with active noise cancellation.",
  );
  assert.equal(detailView.getByText("₹3,499").textContent, "₹3,499");
  assert.equal(detailView.getByText("In stock").textContent, "In stock");
  assert.equal(detailView.getByText("Battery life").textContent, "Battery life");
  assert.equal(detailView.getByText("30 hours").textContent, "30 hours");
  assert.equal(detailView.getByText("Black, Sand").textContent, "Black, Sand");

  await user.click(detailView.getByRole("button", { name: "Close details" }));
  assert.equal(view.queryByRole("dialog", { name: "Quiet Buds details" }), null);
});

test("customer sees the status when product details cannot be loaded", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: dom.window.navigator,
  });

  let resolveDetails!: (response: Response) => void;
  const detailsResponse = new Promise<Response>((resolve) => {
    resolveDetails = resolve;
  });
  globalThis.fetch = async (input) => {
    if (input === "/api/agent/message") {
      return new Response(
        JSON.stringify({
          data: {
            message: "I found one precise match.",
            products: [
              {
                id: "product-1",
                slug: "quiet-buds",
                name: "Quiet Buds",
                description: "Compact wireless earphones.",
                category: "Audio",
                priceMinor: 349900,
                currency: "INR",
                inStock: true,
                attributes: {},
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return detailsResponse;
  };

  const [{ render, cleanup, act }, userEvent, { ShoppingAssistant }] =
    await Promise.all([
      import("@testing-library/react"),
      import("@testing-library/user-event").then((module) => module.default),
      import("./shopping-assistant"),
    ]);

  const view = render(
    React.createElement(ShoppingAssistant, { brandName: "Arc" }),
  );
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const user = userEvent.setup({ document: dom.window.document });

  await user.type(
    view.getByRole("textbox", { name: "Message the Arc Commerce Agent" }),
    "noise cancelling earphones",
  );
  await user.click(view.getByRole("button", { name: "Send" }));
  await user.click(
    await view.findByRole("button", { name: "View Quiet Buds" }),
  );

  assert.equal(
    view
      .getByRole("dialog", { name: "Quiet Buds details" })
      .getAttribute("aria-busy"),
    "true",
  );
  assert.equal(
    view.getByText("Loading product details…").textContent,
    "Loading product details…",
  );

  await act(async () => {
    resolveDetails(
      new Response(
        JSON.stringify({
          error: { message: "Those product details are unavailable." },
        }),
        { status: 404, headers: { "content-type": "application/json" } },
      ),
    );
    await detailsResponse;
  });

  assert.equal(
    (await view.findByRole("alert")).textContent,
    "Those product details are unavailable.",
  );
});

test("customer sees the updated cart after the agent adds a product", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: dom.window.navigator,
  });

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        data: {
          message: "Added 2 × Quiet Buds to your cart.",
          products: [],
          cart: {
            id: "31000000-0000-4000-8000-000000000001",
            totalQuantity: 2,
            subtotalMinor: 699800,
            currency: "INR",
          },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  const [{ render, cleanup }, userEvent, { ShoppingAssistant }] =
    await Promise.all([
      import("@testing-library/react"),
      import("@testing-library/user-event").then((module) => module.default),
      import("./shopping-assistant"),
    ]);

  const view = render(
    React.createElement(ShoppingAssistant, { brandName: "Arc" }),
  );
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const user = userEvent.setup({ document: dom.window.document });

  await user.type(
    view.getByRole("textbox", { name: "Message the Arc Commerce Agent" }),
    "add two Quiet Buds to my cart",
  );
  await user.click(view.getByRole("button", { name: "Send" }));

  assert.equal(
    (await view.findByText("Added 2 × Quiet Buds to your cart.")).textContent,
    "Added 2 × Quiet Buds to your cart.",
  );
  assert.equal(view.getByRole("button", { name: "Cart · 2" }).textContent, " Cart · 2");
  assert.equal(view.queryByText("No close matches yet. Try broadening the request."), null);
});

test("Storefront reuses the server conversation identifier on later turns", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: dom.window.navigator,
  });

  const requestBodies: unknown[] = [];
  globalThis.fetch = async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)));
    const turn = requestBodies.length;
    return new Response(
      JSON.stringify({
        data: {
          conversationId: "41000000-0000-4000-8000-000000000001",
          message: turn === 1 ? "Here are running shoes." : "Here are waterproof options.",
          products: [],
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const [{ render, cleanup }, userEvent, { ShoppingAssistant }] =
    await Promise.all([
      import("@testing-library/react"),
      import("@testing-library/user-event").then((module) => module.default),
      import("./shopping-assistant"),
    ]);

  const view = render(
    React.createElement(ShoppingAssistant, { brandName: "Arc" }),
  );
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const user = userEvent.setup({ document: dom.window.document });
  const composer = view.getByRole("textbox", {
    name: "Message the Arc Commerce Agent",
  });

  await user.type(composer, "show me running shoes");
  await user.click(view.getByRole("button", { name: "Send" }));
  await view.findByText("Here are running shoes.");
  await user.type(composer, "only waterproof ones");
  await user.click(view.getByRole("button", { name: "Send" }));
  await view.findByText("Here are waterproof options.");

  assert.deepEqual(requestBodies, [
    { message: "show me running shoes" },
    {
      conversationId: "41000000-0000-4000-8000-000000000001",
      message: "only waterproof ones",
    },
  ]);
});

test("Customer can read earlier Conversation Turns after a later response", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: dom.window.navigator,
  });

  let turn = 0;
  globalThis.fetch = async () => {
    turn += 1;
    return new Response(
      JSON.stringify({
        data: {
          conversationId: "41000000-0000-4000-8000-000000000001",
          message:
            turn === 1
              ? "Here are running shoes."
              : "Here are waterproof options.",
          products: [],
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const [{ render, cleanup }, userEvent, { ShoppingAssistant }] =
    await Promise.all([
      import("@testing-library/react"),
      import("@testing-library/user-event").then((module) => module.default),
      import("./shopping-assistant"),
    ]);

  const view = render(
    React.createElement(ShoppingAssistant, { brandName: "Arc" }),
  );
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const user = userEvent.setup({ document: dom.window.document });
  const composer = view.getByRole("textbox", {
    name: "Message the Arc Commerce Agent",
  });

  await user.type(composer, "show me running shoes");
  await user.click(view.getByRole("button", { name: "Send" }));
  await view.findByText("Here are running shoes.");
  await user.type(composer, "only waterproof ones");
  await user.click(view.getByRole("button", { name: "Send" }));
  await view.findByText("Here are waterproof options.");

  assert.equal(
    view.getByText("show me running shoes").textContent,
    "show me running shoes",
  );
  assert.equal(
    view.getByText("Here are running shoes.").textContent,
    "Here are running shoes.",
  );
  assert.equal(
    view.getByText("only waterproof ones").textContent,
    "only waterproof ones",
  );
  assert.equal(
    view.getByText("Here are waterproof options.").textContent,
    "Here are waterproof options.",
  );
});
