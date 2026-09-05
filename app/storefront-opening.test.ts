import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { answerMediaQueries, installBrowser } from "./_test/browser";
import { FINE_POINTER_MEDIA_QUERY } from "./_components/shopping-assistant/composer";
import { EXAMPLE_PROMPTS } from "./_components/shopping-assistant/brand-presentation";
import { createEmptyConversationContext } from "@/modules/agent/intent";
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

/** Whatever the Commerce Agent answers with. These cases are about the way in. */
const turnResult = {
  status: "COMPLETED",
  conversationId: "41000000-0000-4000-8000-000000000001",
  message: "Here is a shortlist.",
  intentBrief: {
    goal: "Find everyday shoes",
    constraints: createEmptyConversationContext().productConstraints,
    knownEntities: [],
    missingInformation: [],
    confidence: 1,
    requestedEffects: [],
  },
  products: [
    {
      id: "21000000-0000-4000-8000-000000000002",
      slug: "road-two",
      name: "Road Two",
      description: "A daily road-running shoe.",
      category: "Footwear",
      priceMinor: 390000,
      currency: "INR",
      inStock: true,
      attributes: {},
    },
  ],
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
    if (url === "/api/agent/message") return Response.json({ data: turnResult });
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

test("tapping an example prompt starts a Conversation Turn", async (t) => {
  const { view, user, requests } = await openStorefront(t);
  const [example] = EXAMPLE_PROMPTS;

  await user.click(view.getByRole("button", { name: example }));

  const turn = requests.find((request) => request.url === "/api/agent/message");
  assert.equal(
    (turn?.body as { message: string } | undefined)?.message,
    example,
  );
  assert.match(
    (turn?.body as { idempotencyKey: string }).idempotencyKey,
    /^[0-9a-f-]{36}$/,
  );
  assert.ok(await view.findByText("Here is a shortlist."));
});

test("exactly one message composer is on screen throughout", async (t) => {
  const { view, user } = await openStorefront(t);

  assert.equal(view.getAllByRole("textbox", { name: /message/i }).length, 1);

  await user.click(view.getByRole("button", { name: EXAMPLE_PROMPTS[0] }));
  await view.findByText("Here is a shortlist.");

  assert.equal(view.getAllByRole("textbox", { name: /message/i }).length, 1);
});

test("the opening state gives way to the Conversation it started", async (t) => {
  const { view, user } = await openStorefront(t);

  await user.click(view.getByRole("button", { name: EXAMPLE_PROMPTS[0] }));
  await view.findByText("Here is a shortlist.");

  assert.equal(view.queryByRole("heading", { level: 1 }), null);
  assert.equal(view.queryByRole("button", { name: EXAMPLE_PROMPTS[1] }), null);
});

test("a Customer with a hardware keyboard can type without aiming first", async (t) => {
  const { view, dom } = await openStorefront(t, {
    matchesMedia: (query) => query === FINE_POINTER_MEDIA_QUERY,
  });

  assert.equal(
    dom.window.document.activeElement,
    view.getByRole("textbox", { name: /message/i }),
  );
});

test("a Customer on a touch screen keeps the opening state unobscured", async (t) => {
  const { view, dom } = await openStorefront(t, {
    matchesMedia: () => false,
  });

  assert.notEqual(
    dom.window.document.activeElement,
    view.getByRole("textbox", { name: /message/i }),
  );
});
