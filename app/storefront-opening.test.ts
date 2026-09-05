import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { answerMediaQueries, installBrowser } from "./_test/browser";
import type { CartView } from "@/modules/cart/cart";

/**
 * The Brand's own description, as the Brand record holds it. The Storefront
 * renders it verbatim, so a test that asserts the headline is asserting that
 * the Brand's words reached the Customer unedited.
 */
const BRAND_DESCRIPTION = "Everyday footwear and accessories.";

const emptyCart: CartView = {
  id: "31000000-0000-4000-8000-000000000001",
  version: 0,
  items: [],
  totalQuantity: 0,
  subtotalMinor: 0,
  currency: "INR",
};

/**
 * Renders a Storefront a Customer has just arrived at, with no Conversation
 * behind them.
 *
 * The Brand copy the page component reads on the server arrives here as props,
 * so the whole opening state is assertable without a database.
 *
 * @param t - The test this Storefront belongs to.
 * @param options - The Catalog behind the Storefront, and this Customer's
 *   viewport.
 */
async function openStorefront(
  t: TestContext,
  options: {
    /** Which media queries this Customer's device matches. */
    matchesMedia?: (query: string) => boolean;
  } = {},
) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
  installBrowser(dom);
  if (options.matchesMedia) answerMediaQueries(dom, options.matchesMedia);

  const requests: Array<{ url: string; method: string; body?: unknown }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requests.push({
      url,
      method,
      ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
    });
    if (url === "/api/agent/conversation") return Response.json({ data: null });
    if (url === "/api/cart" && method === "GET") {
      return Response.json({ data: emptyCart });
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  };

  const [testingLibrary, userEvent, { ShoppingAssistant }] = await Promise.all([
    import("@testing-library/react"),
    import("@testing-library/user-event").then((module) => module.default),
    import("./shopping-assistant"),
  ]);
  const view = testingLibrary.render(
    React.createElement(ShoppingAssistant, {
      brandName: "Arc",
      brandDescription: BRAND_DESCRIPTION,
      resumeConversation: true,
    }),
  );
  t.after(() => {
    testingLibrary.cleanup();
    dom.window.close();
  });

  return {
    view,
    dom,
    requests,
    user: userEvent.setup({ document: dom.window.document }),
    within: testingLibrary.within,
  };
}

test("the Storefront's opening state names what the Brand sells", async (t) => {
  const { view } = await openStorefront(t);

  assert.equal(
    view.getByRole("heading", { level: 1 }).textContent,
    BRAND_DESCRIPTION,
  );
});
