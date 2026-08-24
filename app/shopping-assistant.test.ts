import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React from "react";

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
