import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { answerMediaQueries, installBrowser } from "./_test/browser";
import { FINE_POINTER_MEDIA_QUERY } from "./_components/shopping-assistant/composer";
import {
  categoryPrompt,
  EXAMPLE_PROMPTS,
} from "./_components/shopping-assistant/brand-presentation";
import { createEmptyConversationContext } from "@/modules/agent/intent";
import type { CartView } from "@/modules/cart/cart";
import type { CatalogCategory } from "@/modules/catalog/catalog";

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

/** What this Brand's Catalog holds, largest category first, as the query orders it. */
const catalogCategories: CatalogCategory[] = [
  { category: "Footwear", productCount: 58 },
  { category: "Socks", productCount: 20 },
  { category: "Shoe Care", productCount: 9 },
];

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
    /** What the Catalog offers, as the page component read it on the server. */
    categories?: CatalogCategory[];
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
      categories: options.categories ?? catalogCategories,
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

test("the category strip shows the Catalog in the order the Catalog gives", async (t) => {
  const { view, within } = await openStorefront(t);

  const strip = view.getByRole("group", { name: "Shop by category" });
  assert.deepEqual(
    within(strip)
      .getAllByRole("button")
      .map((tile) => tile.getAttribute("aria-label")),
    ["Footwear, 58 Products", "Socks, 20 Products", "Shoe Care, 9 Products"],
  );
});

test("tapping a category starts a Conversation Turn for that category", async (t) => {
  const { view, user, requests } = await openStorefront(t);

  await user.click(view.getByRole("button", { name: /^Socks/ }));

  const turn = requests.find((request) => request.url === "/api/agent/message");
  assert.equal(
    (turn?.body as { message: string } | undefined)?.message,
    categoryPrompt("Socks"),
  );
  assert.match(
    (turn?.body as { idempotencyKey: string }).idempotencyKey,
    /^[0-9a-f-]{36}$/,
  );
  assert.ok(await view.findByText("Here is a shortlist."));
});

test("a Catalog the Storefront could not read still leaves a way in", async (t) => {
  const { view, user, requests } = await openStorefront(t, { categories: [] });

  assert.equal(
    view.getByRole("heading", { level: 1 }).textContent,
    BRAND_DESCRIPTION,
  );
  assert.equal(view.queryByRole("group", { name: "Shop by category" }), null);

  await user.type(
    view.getByRole("textbox", { name: /message/i }),
    "Something for the rain",
  );
  await user.click(view.getByRole("button", { name: /send/i }));

  const turn = requests.find((request) => request.url === "/api/agent/message");
  assert.equal(
    (turn?.body as { message: string } | undefined)?.message,
    "Something for the rain",
  );
});
