import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React from "react";

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

  const view = render(React.createElement(ShoppingAssistant));
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const user = userEvent.setup({ document: dom.window.document });
  const composer = view.getByRole("textbox", {
    name: "Message the shopping assistant",
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
          message: "I found one precise match.",
          intent: {
            productTypes: ["earphones"],
            features: ["noise cancelling"],
            category: "Audio",
            minPriceMinor: null,
            maxPriceMinor: 500000,
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

  const view = render(React.createElement(ShoppingAssistant));
  const user = userEvent.setup({ document: dom.window.document });
  const composer = view.getByRole("textbox", {
    name: "Message the shopping assistant",
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

  const view = render(React.createElement(ShoppingAssistant));
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const user = userEvent.setup({ document: dom.window.document });

  await user.type(
    view.getByRole("textbox", { name: "Message the shopping assistant" }),
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

  const view = render(React.createElement(ShoppingAssistant));
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const user = userEvent.setup({ document: dom.window.document });

  await user.type(
    view.getByRole("textbox", { name: "Message the shopping assistant" }),
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
