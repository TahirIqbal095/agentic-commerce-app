import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React from "react";
import { createEmptyConversationContext } from "@/modules/agent/intent";
import type { CurrentConversation } from "./_components/shopping-assistant/types";

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

test("customer can submit a request and read product results above the persistent composer", async (t) => {
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
            {
              id: "product-2",
              name: "Studio Max",
              description: "Over-ear headphones for focused listening.",
              category: "Audio",
              priceMinor: 449900,
              currency: "INR",
              inStock: true,
            },
            {
              id: "product-3",
              name: "Travel Pods",
              description: "Lightweight earphones for daily travel.",
              category: "Audio",
              priceMinor: 299900,
              currency: "INR",
              inStock: false,
            },
          ],
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
  const composer = view.getByRole("textbox", {
    name: "Message the Arc Commerce Agent",
  });

  assert.equal(composer.tagName, "TEXTAREA");
  await user.type(composer, "noise cancelling earphones under 5000");
  await user.click(view.getByRole("button", { name: "Send" }));

  const product = await view.findByRole("heading", { name: "Quiet Buds" });
  const recommendationSet = view.queryByRole("region", {
    name: "Recommendation Set",
  });
  assert.ok(
    recommendationSet,
    "expected an accessible Recommendation Set region",
  );
  const recommendationView = within(recommendationSet);
  const form = composer.closest("form");

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0]?.[0], "/api/agent/message");
  const submittedBody = JSON.parse(String(fetchCalls[0]?.[1]?.body));
  assert.match(submittedBody.idempotencyKey, /^[0-9a-f-]{36}$/);
  assert.deepEqual({ ...submittedBody, idempotencyKey: undefined }, {
    idempotencyKey: undefined,
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
  assert.equal(recommendationSet.getAttribute("tabindex"), "0");
  assert.deepEqual(
    recommendationView
      .getAllByRole("heading")
      .map((heading) => heading.textContent),
    ["Quiet Buds", "Studio Max", "Travel Pods"],
  );
  assert.equal((composer as HTMLInputElement).value, "");

});

test("Customer sees a clarification question without discovery-only presentation", async (t) => {
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

  const constraints = {
    ...createEmptyConversationContext().productConstraints,
    category: "Audio",
  };
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        data: {
          status: "NEEDS_INPUT",
          conversationId: "41000000-0000-4000-8000-000000000001",
          message: "What kind of audio Product would suit you best?",
          question: "What kind of audio Product would suit you best?",
          missingInformation: ["product type"],
          intentBrief: {
            goal: "Find an audio Product",
            constraints,
            knownEntities: [{ type: "CATEGORY", value: "Audio" }],
            missingInformation: ["product type"],
            confidence: 0.7,
            requestedEffects: ["DISCOVER_PRODUCTS"],
          },
          products: [],
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

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
    "I need something for listening",
  );
  await user.click(view.getByRole("button", { name: "Send" }));

  assert.equal(
    (await view.findByText("What kind of audio Product would suit you best?"))
      .textContent,
    "What kind of audio Product would suit you best?",
  );
  assert.equal(
    Boolean(
      view.queryByText("No close matches yet. Try broadening the request."),
    ),
    false,
  );
  const contextSummary = view.getByRole("complementary", {
    name: "Context Summary",
  });
  assert.equal(
    within(contextSummary).getByText("Category: Audio").textContent,
    "Category: Audio",
  );
  assert.equal(Boolean(view.queryByText("Audio")), false);
});

test("Customer sees authoritative Commerce Agent messages for zero-Product responses", async (t) => {
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

  const constraints = createEmptyConversationContext().productConstraints;
  const [{ render, cleanup }, { ShoppingAssistant }] = await Promise.all([
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
            customerMessage: "Show me emerald headphones",
            result: {
              status: "COMPLETED",
              conversationId: "41000000-0000-4000-8000-000000000001",
              message: "There are no emerald headphones in the Catalog today.",
              intentBrief: {
                goal: "Find emerald headphones",
                constraints,
                knownEntities: [],
                missingInformation: [],
                confidence: 0.94,
                requestedEffects: ["DISCOVER_PRODUCTS"],
              },
              products: [],
            },
            error: null,
          },
          {
            id: "51000000-0000-4000-8000-000000000002",
            customerMessage: "Try again",
            result: {
              status: "TEMPORARILY_UNAVAILABLE",
              conversationId: "41000000-0000-4000-8000-000000000001",
              message: "The Catalog is temporarily unavailable. Please try again.",
              retryable: true,
              products: [],
            },
            error: null,
          },
        ],
        contextSummary: constraints,
        revision: 2,
      },
    }),
  );
  t.after(() => {
    cleanup();
    dom.window.close();
  });

  assert.equal(
    view.getByText("There are no emerald headphones in the Catalog today.")
      .textContent,
    "There are no emerald headphones in the Catalog today.",
  );
  assert.equal(
    view.getByText("The Catalog is temporarily unavailable. Please try again.")
      .textContent,
    "The Catalog is temporarily unavailable. Please try again.",
  );
  assert.equal(
    Boolean(
      view.queryByText("No close matches yet. Try broadening the request."),
    ),
    false,
  );
});

test("Customer can navigate a Recommendation Set one Product at a time", async (t) => {
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

  const products = ["Quiet Buds", "Studio Max", "Travel Pods"].map(
    (name, index) => ({
      id: `product-${index + 1}`,
      slug: name.toLowerCase().replaceAll(" ", "-"),
      name,
      description: `${name} description.`,
      category: "Audio",
      priceMinor: 299900 + index * 50000,
      currency: "INR",
      inStock: true,
      attributes: {},
    }),
  );
  const constraints = createEmptyConversationContext().productConstraints;
  const [{ render, cleanup, act }, userEvent, { ShoppingAssistant }] =
    await Promise.all([
      import("@testing-library/react"),
      import("@testing-library/user-event").then((module) => module.default),
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
            customerMessage: "Show me headphones",
            result: {
              status: "COMPLETED",
              conversationId: "41000000-0000-4000-8000-000000000001",
              message: "Here are three options.",
              intentBrief: {
                goal: "Find headphones",
                constraints,
                knownEntities: [],
                missingInformation: [],
                confidence: 0.95,
                requestedEffects: ["DISCOVER_PRODUCTS"],
              },
              products,
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
  const user = userEvent.setup({ document: dom.window.document });
  const recommendationSet = view.getByRole("region", {
    name: "Recommendation Set",
  });
  let scrollLeft = 0;
  Object.defineProperties(recommendationSet, {
    clientWidth: { configurable: true, value: 640 },
    scrollWidth: { configurable: true, value: 960 },
    scrollLeft: {
      configurable: true,
      get: () => scrollLeft,
      set: (value: number) => {
        scrollLeft = value;
      },
    },
  });
  const firstRecommendation = recommendationSet.firstElementChild;
  assert.ok(firstRecommendation instanceof dom.window.HTMLElement);
  Object.defineProperty(firstRecommendation, "offsetWidth", {
    configurable: true,
    value: 300,
  });
  Object.defineProperty(recommendationSet, "scrollBy", {
    configurable: true,
    value: ({ left = 0 }: ScrollToOptions) => {
      scrollLeft = Math.max(0, Math.min(320, scrollLeft + left));
      recommendationSet.dispatchEvent(new dom.window.Event("scroll"));
    },
  });

  await act(async () => {
    recommendationSet.dispatchEvent(new dom.window.Event("scroll"));
  });

  const previous = view.queryByRole("button", {
    name: "Previous Recommendation",
  });
  const next = view.queryByRole("button", { name: "Next Recommendation" });
  assert.ok(previous, "expected a previous Recommendation control");
  assert.ok(next, "expected a next Recommendation control");
  assert.equal(previous.hasAttribute("disabled"), true);
  assert.equal(next.hasAttribute("disabled"), false);

  await user.click(next);
  assert.equal(scrollLeft, 300);
  assert.equal(previous.hasAttribute("disabled"), false);

  scrollLeft = 320;
  await act(async () => {
    recommendationSet.dispatchEvent(new dom.window.Event("scroll"));
  });
  assert.equal(next.hasAttribute("disabled"), true);

  await user.click(previous);
  assert.equal(scrollLeft, 20);
  assert.equal(next.hasAttribute("disabled"), false);
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
  const viewDetails = await view.findByRole("button", {
    name: "View Quiet Buds details",
  });
  assert.equal(viewDetails.textContent?.trim(), "View details");
  await user.click(viewDetails);

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
    await view.findByRole("button", { name: "View Quiet Buds details" }),
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

test("Customer sees a structured Cart panel within the Conversation", async (t) => {
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
          status: "COMPLETED",
          conversationId: "41000000-0000-4000-8000-000000000001",
          message: "Here’s what’s in your Cart.",
          products: [],
          cart: {
            id: "31000000-0000-4000-8000-000000000001",
            items: [
              {
                productId: "21000000-0000-4000-8000-000000000002",
                productName: "TrailCrest Grip Running Shoes",
                quantity: 1,
                cartPriceMinor: 529900,
                subtotalMinor: 529900,
              },
              {
                productId: "21000000-0000-4000-8000-000000000001",
                productName: "StrideFlow Daily Running Shoes",
                quantity: 2,
                cartPriceMinor: 379900,
                subtotalMinor: 759800,
              },
            ],
            totalQuantity: 3,
            subtotalMinor: 1289700,
            currency: "INR",
          },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

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
    "What's in my Cart?",
  );
  await user.click(view.getByRole("button", { name: "Send" }));

  const panel = await view.findByRole("region", { name: "Your Cart" });
  const cart = within(panel);
  assert.ok(cart.getByText("TrailCrest Grip Running Shoes"));
  assert.ok(cart.getByText("StrideFlow Daily Running Shoes"));
  assert.ok(cart.getByText("1 × ₹5,299"));
  assert.ok(cart.getByText("2 × ₹3,799"));
  assert.ok(cart.getByText("₹12,897"));
  assert.equal(view.getByRole("button", { name: "Cart · 3" }).textContent, " Cart · 3");
});

test("Customer sees an empty Cart summary with zero totals and Product discovery", async (t) => {
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
          status: "COMPLETED",
          conversationId: "41000000-0000-4000-8000-000000000001",
          message: "Your Cart is empty.",
          products: [],
          cart: {
            id: null,
            items: [],
            totalQuantity: 0,
            subtotalMinor: 0,
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
    "Is there anything in my Cart?",
  );
  await user.click(view.getByRole("button", { name: "Send" }));

  assert.equal((await view.findAllByText("Your Cart is empty.")).length, 2);
  assert.equal(view.getByRole("button", { name: "Cart · 0" }).textContent, " Cart · 0");
  const emptyCart = view.getByRole("region", { name: "Your Cart" });
  assert.ok(emptyCart.textContent?.includes("₹0"));
  assert.ok(view.getByRole("button", { name: "Discover Products" }));
});

test("after reload only the newest Cart Summary offers Cart Item Removal while earlier summaries remain visible as history", async (t) => {
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

  const cartItem = {
    productId: "21000000-0000-4000-8000-000000000001",
    productName: "Road Two",
    quantity: 1,
    cartPriceMinor: 390000,
    subtotalMinor: 390000,
  };
  const result = (cartId: string) => ({
    status: "COMPLETED" as const,
    conversationId: "41000000-0000-4000-8000-000000000001",
    message: "Here’s what’s in your Cart.",
    intentBrief: {
      goal: "Inspect the Cart",
      constraints: createEmptyConversationContext().productConstraints,
      knownEntities: [],
      missingInformation: [],
      confidence: 1,
      requestedEffects: ["INSPECT_CART" as const],
    },
    products: [],
    cart: {
      id: cartId,
      items: [cartItem],
      totalQuantity: 1,
      subtotalMinor: 390000,
      currency: "INR",
    },
  });
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
            customerMessage: "What is in my Cart?",
            result: result("31000000-0000-4000-8000-000000000001"),
            error: null,
          },
          {
            id: "51000000-0000-4000-8000-000000000002",
            customerMessage: "Show my Cart again",
            result: result("31000000-0000-4000-8000-000000000001"),
            error: null,
          },
        ],
        contextSummary: createEmptyConversationContext().productConstraints,
        revision: 0,
      },
    }),
  );
  t.after(() => {
    cleanup();
    dom.window.close();
  });

  const summaries = view.getAllByRole("region", { name: "Your Cart" });
  assert.equal(summaries.length, 2);
  assert.ok(within(summaries[0]).getByText("Historical Cart Summary"));
  assert.equal(
    within(summaries[0]).queryByRole("button", { name: "Remove Road Two" }),
    null,
  );
  assert.ok(within(summaries[1]).getByText("Current Cart Summary"));
  assert.ok(within(summaries[1]).getByRole("button", { name: "Remove Road Two" }));
  assert.equal(view.getByRole("button", { name: "Cart · 1" }).textContent, " Cart · 1");
});

test("activating Remove disables the affected Cart Item and sends a structured deterministic command", async (t) => {
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

  let requestedUrl: RequestInfo | URL | undefined;
  let requestedInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    requestedUrl = input;
    requestedInit = init;
    return new Promise<Response>(() => undefined);
  };
  const constraints = createEmptyConversationContext().productConstraints;
  const [{ render, cleanup }, userEvent, { ShoppingAssistant }] =
    await Promise.all([
      import("@testing-library/react"),
      import("@testing-library/user-event").then((module) => module.default),
      import("./shopping-assistant"),
    ]);
  const view = render(
    React.createElement(ShoppingAssistant, {
      brandName: "Arc",
      initialConversation: {
        conversationId: "41000000-0000-4000-8000-000000000001",
        transcript: [{
          id: "51000000-0000-4000-8000-000000000001",
          customerMessage: "Show my Cart",
          result: {
            status: "COMPLETED",
            conversationId: "41000000-0000-4000-8000-000000000001",
            message: "Here’s what’s in your Cart.",
            intentBrief: {
              goal: "Inspect the Cart",
              constraints,
              knownEntities: [],
              missingInformation: [],
              confidence: 1,
              requestedEffects: ["INSPECT_CART"],
            },
            products: [],
            cart: {
              id: "31000000-0000-4000-8000-000000000001",
              items: [{
                productId: "21000000-0000-4000-8000-000000000001",
                productName: "Road Two",
                quantity: 1,
                cartPriceMinor: 390000,
                subtotalMinor: 390000,
              }],
              totalQuantity: 1,
              subtotalMinor: 390000,
              currency: "INR",
            },
          },
          error: null,
        }],
        contextSummary: constraints,
        revision: 0,
      },
    }),
  );
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const user = userEvent.setup({ document: dom.window.document });

  const remove = view.getByRole("button", { name: "Remove Road Two" });
  await user.click(remove);

  assert.equal(remove.hasAttribute("disabled"), true);
  assert.equal(requestedUrl, "/api/agent/cart-command");
  const body = JSON.parse(String(requestedInit?.body));
  assert.match(body.idempotencyKey, /^[0-9a-f-]{36}$/);
  assert.deepEqual({ ...body, idempotencyKey: undefined }, {
    conversationId: "41000000-0000-4000-8000-000000000001",
    idempotencyKey: undefined,
    command: {
      type: "REMOVE_CART_ITEM",
      productId: "21000000-0000-4000-8000-000000000001",
    },
  });
});

test("removing the final Cart Item shows the authoritative empty Cart and a Product discovery route", async (t) => {
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
  const constraints = createEmptyConversationContext().productConstraints;
  const requestUrls: Array<RequestInfo | URL> = [];
  globalThis.fetch = async (input) => {
    requestUrls.push(input);
    if (input === "/api/agent/message") {
      return new Response(JSON.stringify({ data: {
        status: "COMPLETED",
        conversationId: "41000000-0000-4000-8000-000000000001",
        message: "Let’s discover another Product.",
        intentBrief: {
          goal: "Discover Products",
          constraints,
          knownEntities: [],
          missingInformation: [],
          confidence: 1,
          requestedEffects: ["DISCOVER_PRODUCTS"],
        },
        products: [],
      } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      data: {
      status: "COMPLETED",
      conversationId: "41000000-0000-4000-8000-000000000001",
      message: "Removed Road Two from your Cart.",
      intentBrief: {
        goal: "Remove Road Two from the Cart",
        constraints,
        knownEntities: [],
        missingInformation: [],
        confidence: 1,
        requestedEffects: ["REMOVE_FROM_CART"],
      },
      products: [],
      cart: {
        id: "31000000-0000-4000-8000-000000000001",
        items: [],
        totalQuantity: 0,
        subtotalMinor: 0,
        currency: "INR",
      },
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const [{ render, cleanup, within }, userEvent, { ShoppingAssistant }] =
    await Promise.all([
      import("@testing-library/react"),
      import("@testing-library/user-event").then((module) => module.default),
      import("./shopping-assistant"),
    ]);
  const view = render(React.createElement(ShoppingAssistant, {
    brandName: "Arc",
    initialConversation: {
      conversationId: "41000000-0000-4000-8000-000000000001",
      transcript: [{
        id: "51000000-0000-4000-8000-000000000001",
        customerMessage: "Show my Cart",
        result: {
          status: "COMPLETED",
          conversationId: "41000000-0000-4000-8000-000000000001",
          message: "Here’s what’s in your Cart.",
          intentBrief: {
            goal: "Inspect the Cart",
            constraints,
            knownEntities: [],
            missingInformation: [],
            confidence: 1,
            requestedEffects: ["INSPECT_CART"],
          },
          products: [],
          cart: {
            id: "31000000-0000-4000-8000-000000000001",
            items: [{
              productId: "21000000-0000-4000-8000-000000000001",
              productName: "Road Two",
              quantity: 1,
              cartPriceMinor: 390000,
              subtotalMinor: 390000,
            }],
            totalQuantity: 1,
            subtotalMinor: 390000,
            currency: "INR",
          },
        },
        error: null,
      }],
      contextSummary: constraints,
      revision: 0,
    },
  }));
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const user = userEvent.setup({ document: dom.window.document });

  await user.click(view.getByRole("button", { name: "Remove Road Two" }));

  assert.ok(await view.findByText("Removed Road Two from your Cart."));
  assert.equal(view.getByRole("button", { name: "Cart · 0" }).textContent, " Cart · 0");
  const summaries = view.getAllByRole("region", { name: "Your Cart" });
  assert.equal(summaries.length, 2);
  assert.ok(within(summaries[0]).getByText("Historical Cart Summary"));
  const emptySummary = within(summaries[1]);
  assert.ok(emptySummary.getByText("Your Cart is empty."));
  assert.ok(emptySummary.getByText("₹0"));
  await user.click(emptySummary.getByRole("button", { name: "Discover Products" }));
  assert.ok(await view.findByText("Let’s discover another Product."));
  assert.deepEqual(requestUrls, [
    "/api/agent/cart-command",
    "/api/agent/message",
  ]);
});

test("failed Cart Item Removal shows the authoritative reason beside the restored Cart Item", async (t) => {
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
  const constraints = createEmptyConversationContext().productConstraints;
  const cart = {
    id: "31000000-0000-4000-8000-000000000001",
    items: [{
      productId: "21000000-0000-4000-8000-000000000001",
      productName: "Road Two",
      quantity: 1,
      cartPriceMinor: 390000,
      subtotalMinor: 390000,
    }],
    totalQuantity: 1,
    subtotalMinor: 390000,
    currency: "INR",
  };
  let removalAttempts = 0;
  let conversationLoads = 0;
  globalThis.fetch = async (input) => {
    if (input === "/api/agent/conversation") {
      conversationLoads += 1;
      return new Response(JSON.stringify({ data: {
        conversationId: "41000000-0000-4000-8000-000000000001",
        transcript: [{
          id: "51000000-0000-4000-8000-000000000001",
          customerMessage: "Show my Cart",
          result: {
            status: "COMPLETED",
            conversationId: "41000000-0000-4000-8000-000000000001",
            message: "Here’s what’s in your Cart.",
            intentBrief: {
              goal: "Inspect the Cart",
              constraints,
              knownEntities: [],
              missingInformation: [],
              confidence: 1,
              requestedEffects: ["INSPECT_CART"],
            },
            products: [],
            cart,
          },
          error: null,
        }],
        contextSummary: constraints,
        revision: 0,
      } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    removalAttempts += 1;
    if (removalAttempts === 2) {
      return new Response(JSON.stringify({ error: {
        code: "CART_UNAVAILABLE",
        message: "The Cart service is temporarily unavailable.",
        details: {},
      } }), { status: 503, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ data: {
      status: "NEEDS_INPUT",
    conversationId: "41000000-0000-4000-8000-000000000001",
    message: "Road Two could not be removed because the Cart changed. Please try again.",
    question: "Would you like to try removing Road Two again?",
    missingInformation: [],
    intentBrief: {
      goal: "Remove Road Two from the Cart",
      constraints,
      knownEntities: [],
      missingInformation: [],
      confidence: 1,
      requestedEffects: ["REMOVE_FROM_CART"],
    },
    products: [],
    cart,
    cartItemError: {
      productId: "21000000-0000-4000-8000-000000000001",
      message: "Road Two could not be removed because the Cart changed. Please try again.",
    },
    } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const [{ render, cleanup, within }, userEvent, { ShoppingAssistant }] =
    await Promise.all([
      import("@testing-library/react"),
      import("@testing-library/user-event").then((module) => module.default),
      import("./shopping-assistant"),
    ]);
  const view = render(React.createElement(ShoppingAssistant, {
    brandName: "Arc",
    initialConversation: {
      conversationId: "41000000-0000-4000-8000-000000000001",
      transcript: [{
        id: "51000000-0000-4000-8000-000000000001",
        customerMessage: "Show my Cart",
        result: {
          status: "COMPLETED",
          conversationId: "41000000-0000-4000-8000-000000000001",
          message: "Here’s what’s in your Cart.",
          intentBrief: {
            goal: "Inspect the Cart",
            constraints,
            knownEntities: [],
            missingInformation: [],
            confidence: 1,
            requestedEffects: ["INSPECT_CART"],
          },
          products: [],
          cart,
        },
        error: null,
      }],
      contextSummary: constraints,
      revision: 0,
    },
  }));
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const user = userEvent.setup({ document: dom.window.document });

  await user.click(view.getByRole("button", { name: "Remove Road Two" }));

  const summaries = await view.findAllByRole("region", { name: "Your Cart" });
  const current = within(summaries.at(-1)!);
  assert.equal(current.getByRole("alert").textContent,
    "Road Two could not be removed because the Cart changed. Please try again.");
  assert.equal(current.getByRole("button", { name: "Remove Road Two" }).hasAttribute("disabled"), false);
  assert.equal(view.getByRole("button", { name: "Cart · 1" }).textContent, " Cart · 1");

  await user.click(current.getByRole("button", { name: "Remove Road Two" }));
  assert.equal(conversationLoads, 1);
  const restoredSummaries = await view.findAllByRole("region", { name: "Your Cart" });
  const restoredCurrent = within(restoredSummaries.at(-1)!);
  assert.equal(
    restoredCurrent.getByRole("alert").textContent,
    "The Cart service is temporarily unavailable.",
  );
  assert.equal(restoredCurrent.getByRole("button", { name: "Remove Road Two" }).hasAttribute("disabled"), false);

  await user.click(restoredCurrent.getByRole("button", { name: "Remove Road Two" }));
  const retriedSummaries = await view.findAllByRole("region", { name: "Your Cart" });
  assert.equal(
    within(retriedSummaries.at(-1)!).getByRole("alert").textContent,
    "Road Two could not be removed because the Cart changed. Please try again.",
  );
});

test("only the current Cart Summary offers accessible quantity controls with authoritative limits", async (t) => {
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
  const constraints = createEmptyConversationContext().productConstraints;
  const cart = (quantity: number, availableQuantity: number) => ({
    id: "31000000-0000-4000-8000-000000000001",
    items: [{
      productId: "21000000-0000-4000-8000-000000000001",
      productName: "Road Two",
      quantity,
      cartPriceMinor: 390000,
      subtotalMinor: quantity * 390000,
      availableQuantity,
      productActive: true,
    }],
    totalQuantity: quantity,
    subtotalMinor: quantity * 390000,
    currency: "INR",
  });
  const result = (quantity: number, availableQuantity: number) => ({
    status: "COMPLETED" as const,
    conversationId: "41000000-0000-4000-8000-000000000001",
    message: "Here’s what’s in your Cart.",
    intentBrief: {
      goal: "Inspect the Cart",
      constraints,
      knownEntities: [],
      missingInformation: [],
      confidence: 1,
      requestedEffects: ["INSPECT_CART" as const],
    },
    products: [],
    cart: cart(quantity, availableQuantity),
  });
  const [{ render, cleanup, within }, { ShoppingAssistant }] =
    await Promise.all([
      import("@testing-library/react"),
      import("./shopping-assistant"),
    ]);
  const view = render(React.createElement(ShoppingAssistant, {
    brandName: "Arc",
    initialConversation: {
      conversationId: "41000000-0000-4000-8000-000000000001",
      transcript: [
        {
          id: "51000000-0000-4000-8000-000000000001",
          customerMessage: "Show my Cart",
          result: result(1, 3),
          error: null,
        },
        {
          id: "51000000-0000-4000-8000-000000000002",
          customerMessage: "Show my Cart again",
          result: result(3, 3),
          error: null,
        },
      ],
      contextSummary: constraints,
      revision: 0,
    },
  }));
  t.after(() => {
    cleanup();
    dom.window.close();
  });

  const summaries = view.getAllByRole("region", { name: "Your Cart" });
  assert.equal(
    within(summaries[0]).queryByRole("spinbutton", { name: "Road Two quantity" }),
    null,
  );
  const current = within(summaries[1]);
  assert.equal(
    current.getByRole("spinbutton", { name: "Road Two quantity" }).getAttribute("value"),
    "3",
  );
  assert.equal(
    current.getByRole("button", { name: "Increase Road Two quantity" }).hasAttribute("disabled"),
    true,
  );
  assert.equal(
    current.getByRole("button", { name: "Decrease Road Two quantity" }).hasAttribute("disabled"),
    false,
  );
  assert.ok(current.getByRole("button", { name: "Remove Road Two" }));
});

test("increment applies a relative command to the latest authoritative Cart quantity", async (t) => {
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
  const constraints = createEmptyConversationContext().productConstraints;
  let requestBody: Record<string, unknown> | undefined;
  let finishRequest: (() => void) | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    const response = new Response(JSON.stringify({ data: {
      status: "COMPLETED",
      conversationId: "41000000-0000-4000-8000-000000000001",
      message: "Increased Road Two quantity to 5.",
      intentBrief: {
        goal: "Change Road Two quantity",
        constraints,
        knownEntities: [],
        missingInformation: [],
        confidence: 1,
        requestedEffects: ["CHANGE_CART_QUANTITY"],
      },
      products: [],
      cart: {
        id: "31000000-0000-4000-8000-000000000001",
        items: [{
          productId: "21000000-0000-4000-8000-000000000001",
          productName: "Road Two",
          quantity: 5,
          cartPriceMinor: 410000,
          subtotalMinor: 2050000,
          availableQuantity: 8,
          productActive: true,
        }],
        priceChanges: [{
          productId: "21000000-0000-4000-8000-000000000001",
          previousCartPriceMinor: 390000,
          currentCartPriceMinor: 410000,
          direction: "INCREASED",
        }],
        totalQuantity: 5,
        subtotalMinor: 2050000,
        currency: "INR",
      },
    } }), { status: 200, headers: { "content-type": "application/json" } });
    return new Promise<Response>((resolve) => {
      finishRequest = () => resolve(response);
    });
  };
  const [{ render, cleanup }, userEvent, { ShoppingAssistant }] =
    await Promise.all([
      import("@testing-library/react"),
      import("@testing-library/user-event").then((module) => module.default),
      import("./shopping-assistant"),
    ]);
  const view = render(React.createElement(ShoppingAssistant, {
    brandName: "Arc",
    initialConversation: {
      conversationId: "41000000-0000-4000-8000-000000000001",
      transcript: [{
        id: "51000000-0000-4000-8000-000000000001",
        customerMessage: "Show my Cart",
        result: {
          status: "COMPLETED",
          conversationId: "41000000-0000-4000-8000-000000000001",
          message: "Here’s what’s in your Cart.",
          intentBrief: {
            goal: "Inspect the Cart",
            constraints,
            knownEntities: [],
            missingInformation: [],
            confidence: 1,
            requestedEffects: ["INSPECT_CART"],
          },
          products: [],
          cart: {
            id: "31000000-0000-4000-8000-000000000001",
            items: [{
              productId: "21000000-0000-4000-8000-000000000001",
              productName: "Road Two",
              quantity: 2,
              cartPriceMinor: 390000,
              subtotalMinor: 780000,
              availableQuantity: 8,
              productActive: true,
            }],
            totalQuantity: 2,
            subtotalMinor: 780000,
            currency: "INR",
          },
        },
        error: null,
      }],
      contextSummary: constraints,
      revision: 0,
    },
  }));
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const user = userEvent.setup({ document: dom.window.document });

  await user.click(view.getByRole("button", { name: "Increase Road Two quantity" }));

  assert.deepEqual((requestBody?.command), {
    type: "CHANGE_CART_ITEM_QUANTITY",
    productId: "21000000-0000-4000-8000-000000000001",
    mode: "RELATIVE",
    quantity: 1,
  });
  assert.equal(
    view.getByRole("button", { name: "Decrease Road Two quantity" }).hasAttribute("disabled"),
    true,
  );
  assert.equal(
    view.getByRole("spinbutton", { name: "Road Two quantity" }).hasAttribute("disabled"),
    true,
  );
  assert.equal(
    view.getByRole("button", { name: "Remove Road Two" }).hasAttribute("disabled"),
    true,
  );
  assert.ok(view.container.querySelector('[aria-busy="true"]'));
  finishRequest?.();
  assert.ok(await view.findByText("Increased Road Two quantity to 5."));
  assert.equal(view.getByRole("button", { name: "Cart · 5" }).textContent, " Cart · 5");
  assert.ok(view.getByText("Cart Price increased from ₹3,900 to ₹4,100."));
});

test("exact quantity input validates on blur and submits on Enter without mutating while typed", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  const constraints = createEmptyConversationContext().productConstraints;
  const cart = (quantity: number) => ({
    id: "31000000-0000-4000-8000-000000000001",
    items: [{
      productId: "21000000-0000-4000-8000-000000000001",
      productName: "Road Two",
      quantity,
      cartPriceMinor: 390000,
      subtotalMinor: quantity * 390000,
      availableQuantity: 2,
      productActive: true,
    }],
    totalQuantity: quantity,
    subtotalMinor: quantity * 390000,
    currency: "INR",
  });
  const requests: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body));
    requests.push(request);
    const quantity = request.command.quantity as number;
    return new Response(JSON.stringify({ data: {
      status: "COMPLETED",
      conversationId: "41000000-0000-4000-8000-000000000001",
      message: `Set Road Two quantity to ${quantity}.`,
      intentBrief: {
        goal: "Change Road Two quantity",
        constraints,
        knownEntities: [],
        missingInformation: [],
        confidence: 1,
        requestedEffects: ["CHANGE_CART_QUANTITY"],
      },
      products: [],
      cart: cart(quantity),
    } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const [{ render, cleanup }, userEvent, { ShoppingAssistant }] = await Promise.all([
    import("@testing-library/react"),
    import("@testing-library/user-event").then((module) => module.default),
    import("./shopping-assistant"),
  ]);
  const view = render(React.createElement(ShoppingAssistant, {
    brandName: "Arc",
    initialConversation: {
      conversationId: "41000000-0000-4000-8000-000000000001",
      transcript: [{
        id: "51000000-0000-4000-8000-000000000001",
        customerMessage: "Show my Cart",
        result: {
          status: "COMPLETED",
          conversationId: "41000000-0000-4000-8000-000000000001",
          message: "Here’s what’s in your Cart.",
          intentBrief: {
            goal: "Inspect the Cart",
            constraints,
            knownEntities: [],
            missingInformation: [],
            confidence: 1,
            requestedEffects: ["INSPECT_CART"],
          },
          products: [],
          cart: cart(5),
        },
        error: null,
      }],
      contextSummary: constraints,
      revision: 0,
    },
  }));
  t.after(() => { cleanup(); dom.window.close(); });
  const user = userEvent.setup({ document: dom.window.document });
  const input = view.getByRole("spinbutton", { name: "Road Two quantity" });

  for (const invalid of ["", "1.5", "-1", "0", "6"]) {
    await user.clear(input);
    if (invalid) await user.type(input, invalid);
    await user.tab();
    assert.equal(input.getAttribute("value"), "5");
    assert.equal(view.getByRole("alert").textContent, "Enter a whole quantity from 1 to 5.");
    await user.click(input);
  }
  assert.equal(requests.length, 0);
  await user.clear(input);
  await user.type(input, "4");
  assert.equal(requests.length, 0);
  await user.keyboard("{Enter}");

  assert.deepEqual(requests[0].command, {
    type: "CHANGE_CART_ITEM_QUANTITY",
    productId: "21000000-0000-4000-8000-000000000001",
    mode: "EXACT",
    quantity: 4,
  });
  assert.ok(await view.findByText("Set Road Two quantity to 4."));

  const currentInput = view.getByRole("spinbutton", { name: "Road Two quantity" });
  await user.clear(currentInput);
  await user.type(currentInput, "3");
  assert.equal(requests.length, 1);
  await user.click(view.getByText("Current Cart Summary"));
  assert.deepEqual(requests[1].command, {
    type: "CHANGE_CART_ITEM_QUANTITY",
    productId: "21000000-0000-4000-8000-000000000001",
    mode: "EXACT",
    quantity: 3,
  });
  assert.ok(await view.findByText("Set Road Two quantity to 3."));
});

test("a repeated quantity command transport failure remains visible after authoritative recovery", async (t) => {
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
  const constraints = createEmptyConversationContext().productConstraints;
  const initialConversation: CurrentConversation = {
    conversationId: "41000000-0000-4000-8000-000000000001",
    transcript: [{
      id: "51000000-0000-4000-8000-000000000001",
      idempotencyKey: "61000000-0000-4000-8000-000000000001",
      customerMessage: "Increase Road Two quantity by 1",
      result: {
        status: "COMPLETED",
        conversationId: "41000000-0000-4000-8000-000000000001",
        message: "Increased Road Two quantity to 2.",
        intentBrief: {
          goal: "Change Road Two quantity",
          constraints,
          knownEntities: [],
          missingInformation: [],
          confidence: 1,
          requestedEffects: ["CHANGE_CART_QUANTITY"],
        },
        products: [],
        cart: {
          id: "31000000-0000-4000-8000-000000000001",
          items: [{
            productId: "21000000-0000-4000-8000-000000000001",
            productName: "Road Two",
            quantity: 2,
            cartPriceMinor: 390000,
            subtotalMinor: 780000,
            availableQuantity: 5,
            productActive: true,
          }],
          totalQuantity: 2,
          subtotalMinor: 780000,
          currency: "INR",
        },
      },
      error: null,
    }],
    contextSummary: constraints,
    revision: 0,
  };
  let commandAttempts = 0;
  globalThis.fetch = async (input) => {
    if (input === "/api/agent/conversation") {
      return new Response(JSON.stringify({ data: initialConversation }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    commandAttempts += 1;
    throw new Error("The Cart connection was interrupted.");
  };
  const [{ render, cleanup }, userEvent, { ShoppingAssistant }] =
    await Promise.all([
      import("@testing-library/react"),
      import("@testing-library/user-event").then((module) => module.default),
      import("./shopping-assistant"),
    ]);
  const view = render(React.createElement(ShoppingAssistant, {
    brandName: "Arc",
    initialConversation,
  }));
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const user = userEvent.setup({ document: dom.window.document });

  await user.click(view.getByRole("button", { name: "Increase Road Two quantity" }));

  assert.equal(commandAttempts, 1);
  assert.equal(
    (await view.findByRole("alert")).textContent,
    "The Cart connection was interrupted.",
  );
  assert.equal(
    view.getByRole("spinbutton", { name: "Road Two quantity" }).getAttribute("value"),
    "2",
  );
});

test("Clear Cart requires confirmation and renders the persisted empty Cart Summary", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  const constraints = createEmptyConversationContext().productConstraints;
  let confirmed = false;
  t.mock.method(dom.window, "confirm", () => confirmed);
  const requests: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ data: {
      status: "COMPLETED",
      conversationId: "41000000-0000-4000-8000-000000000001",
      message: "Cleared your Cart.",
      intentBrief: {
        goal: "Clear the Cart",
        constraints,
        knownEntities: [],
        missingInformation: [],
        confidence: 1,
        requestedEffects: ["CLEAR_CART"],
      },
      products: [],
      cart: {
        id: "31000000-0000-4000-8000-000000000001",
        items: [],
        totalQuantity: 0,
        subtotalMinor: 0,
        currency: "INR",
      },
    } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const [{ render, cleanup, within }, userEvent, { ShoppingAssistant }] = await Promise.all([
    import("@testing-library/react"),
    import("@testing-library/user-event").then((module) => module.default),
    import("./shopping-assistant"),
  ]);
  const view = render(React.createElement(ShoppingAssistant, {
    brandName: "Arc",
    initialConversation: {
      conversationId: "41000000-0000-4000-8000-000000000001",
      transcript: [{
        id: "51000000-0000-4000-8000-000000000001",
        customerMessage: "Show my Cart",
        result: {
          status: "COMPLETED",
          conversationId: "41000000-0000-4000-8000-000000000001",
          message: "Here’s what’s in your Cart.",
          intentBrief: {
            goal: "Inspect the Cart",
            constraints,
            knownEntities: [],
            missingInformation: [],
            confidence: 1,
            requestedEffects: ["INSPECT_CART"],
          },
          products: [],
          cart: {
            id: "31000000-0000-4000-8000-000000000001",
            items: [{
              productId: "21000000-0000-4000-8000-000000000001",
              productName: "Road Two",
              quantity: 2,
              cartPriceMinor: 390000,
              subtotalMinor: 780000,
              availableQuantity: 8,
              productActive: true,
            }],
            totalQuantity: 2,
            subtotalMinor: 780000,
            currency: "INR",
          },
        },
        error: null,
      }],
      contextSummary: constraints,
      revision: 0,
    },
  }));
  t.after(() => { cleanup(); dom.window.close(); });
  const user = userEvent.setup({ document: dom.window.document });

  await user.click(view.getByRole("button", { name: "Clear Cart" }));
  assert.equal(requests.length, 0);
  confirmed = true;
  await user.click(view.getByRole("button", { name: "Clear Cart" }));

  assert.deepEqual(requests[0].command, { type: "CLEAR_CART" });
  assert.ok(await view.findByText("Cleared your Cart."));
  const summaries = view.getAllByRole("region", { name: "Your Cart" });
  assert.equal(summaries.length, 2);
  assert.equal(within(summaries[1]).queryByRole("button", { name: "Clear Cart" }), null);
  assert.ok(within(summaries[1]).getByText("Your Cart is empty."));
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

  assert.deepEqual(
    requestBodies.map((body) => {
      const { idempotencyKey, ...rest } = body as Record<string, unknown>;
      assert.match(String(idempotencyKey), /^[0-9a-f-]{36}$/);
      return rest;
    }),
    [
      { message: "show me running shoes" },
      {
        conversationId: "41000000-0000-4000-8000-000000000001",
        message: "only waterproof ones",
      },
    ],
  );
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

test("Customer can resume and reset the current Conversation without changing the Cart", async (t) => {
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
  const requests: string[] = [];
  globalThis.fetch = async (input, init) => {
    requests.push(`${init?.method ?? "GET"} ${String(input)}`);
    if (init?.method === "POST") {
      return new Response(
        JSON.stringify({
          data: {
            status: "COMPLETED",
            conversationId: "41000000-0000-4000-8000-000000000001",
            message: "Budget removed.",
            intentBrief: {
              goal: "Discover Products",
              constraints: { ...context, productTypes: ["shoes"] },
              knownEntities: [],
              missingInformation: [],
              confidence: 0.9,
              requestedEffects: ["DISCOVER_PRODUCTS"],
            },
            products: [],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ data: { reset: true } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const context = {
    ...createEmptyConversationContext().productConstraints,
    inStockOnly: false,
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
      initialConversation: {
        conversationId: "41000000-0000-4000-8000-000000000001",
        transcript: [
          {
            id: "51000000-0000-4000-8000-000000000001",
            customerMessage: "I want shoes",
            result: {
              status: "COMPLETED",
              conversationId: "41000000-0000-4000-8000-000000000001",
              message: "Here are shoes.",
              intentBrief: {
                goal: "Discover Products",
                constraints: {
                  ...context,
                  productTypes: ["shoes"],
                  maxPriceMinor: 400000,
                },
                knownEntities: [],
                missingInformation: [],
                confidence: 0.9,
                requestedEffects: ["DISCOVER_PRODUCTS"],
              },
              products: [],
            },
            error: null,
          },
        ],
        contextSummary: {
          ...context,
          productTypes: ["shoes"],
          maxPriceMinor: 400000,
        },
        revision: 1,
      },
    }),
  );
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const user = userEvent.setup({ document: dom.window.document });

  assert.equal(view.getByText("I want shoes").textContent, "I want shoes");
  assert.equal(view.getByText("Here are shoes.").textContent, "Here are shoes.");
  const contextSummary = view.getByRole("complementary", {
    name: "Context Summary",
  });
  assert.ok(
    within(contextSummary).queryByText("2 active preferences"),
    "expected the Context Summary to count active preferences",
  );
  assert.equal(
    within(contextSummary).getByText("Product type: shoes").textContent,
    "Product type: shoes",
  );
  assert.equal(
    within(contextSummary).getByText("Maximum price: ₹4,000").textContent,
    "Maximum price: ₹4,000",
  );
  await user.click(
    view.getByRole("button", { name: "Remove maximum price constraint" }),
  );
  await view.findByText("Budget removed.");
  await user.click(view.getByRole("button", { name: "New conversation" }));

  assert.deepEqual(requests, [
    "POST /api/agent/message",
    "DELETE /api/agent/conversation",
  ]);
  assert.equal(view.queryByText("I want shoes"), null);
  assert.equal(view.getByRole("button", { name: "Cart · 0" }).textContent, " Cart · 0");
});
