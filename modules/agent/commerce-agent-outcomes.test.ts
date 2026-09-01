import assert from "node:assert/strict";
import test from "node:test";
import { MockLanguageModelV4 } from "ai/test";
import type { CatalogModule } from "@/modules/catalog/catalog";
import type { CatalogProduct } from "@/modules/catalog/types";
import { createAiCommerceAgentLoop } from "./ai-commerce-agent-loop";
import {
  createCommerceAgent as createProductionCommerceAgent,
  type CommerceAgentLoop,
} from "./commerce-agent";
import type { AgentOutcome } from "./agent-outcome";
import type { AgentMessage, ConversationModule } from "./conversation";
import type { ConversationRepository } from "./conversation-repository";
import type {
  IntentAnalysis,
  IntentAnalyzer,
  IntentBrief,
} from "./intent";
import { createEmptyConversationContext } from "./intent";
import { createConversationModule } from "./conversation";

const conversationId = "41000000-0000-4000-8000-000000000001";
function createCommerceAgent(
  ...args: Parameters<typeof createProductionCommerceAgent>
) {
  const agent = createProductionCommerceAgent(...args);
  return {
    ...agent,
    respond(
      input: Omit<AgentMessage, "idempotencyKey"> & {
        idempotencyKey?: string;
      },
    ) {
      return agent.respond({
        ...input,
        idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
      });
    },
  };
}
const product = {
  id: "21000000-0000-4000-8000-000000000001",
  slug: "strideflow-daily-running-shoes",
  name: "StrideFlow Daily Running Shoes",
  description: "Breathable road-running shoes for daily training.",
  category: "Footwear",
  priceMinor: 399900,
  currency: "INR",
  inStock: true,
  attributes: { support: "Neutral", sizes: ["UK 9"] },
};
const brief: IntentBrief = {
  goal: "Find breathable shoes for road running",
  constraints: {
    productTypes: ["running shoes"],
    useCases: ["road running"],
    features: ["breathable"],
    category: "Footwear",
    minPriceMinor: null,
    maxPriceMinor: 500000,
    size: "UK 9",
    inStockOnly: true,
    attributes: { support: "Neutral" },
  },
  knownEntities: [{ type: "PRODUCT_TYPE", value: "running shoes" }],
  missingInformation: [],
  confidence: 0.94,
  requestedEffects: ["DISCOVER_PRODUCTS"],
};
const blackShirt = {
  ...product,
  id: "21000000-0000-4000-8000-000000000002",
  slug: "everyday-black-shirt",
  name: "Everyday Black Shirt",
  description: "A black cotton shirt for everyday wear.",
  category: "Apparel",
  priceMinor: 149900,
  attributes: { color: "Black", sizes: ["M"] },
};
const formalBlackShirt = {
  ...blackShirt,
  id: "21000000-0000-4000-8000-000000000003",
  slug: "formal-black-shirt",
  name: "Formal Black Shirt",
  description: "A tailored black shirt for formal occasions.",
  priceMinor: 249900,
};
const directAddBrief: IntentBrief = {
  ...brief,
  goal: "Add a black shirt to the Cart",
  constraints: {
    ...brief.constraints,
    productTypes: ["shirt"],
    useCases: [],
    features: [],
    category: "Apparel",
    minPriceMinor: null,
    maxPriceMinor: null,
    size: null,
    attributes: { color: "Black" },
  },
  knownEntities: [{ type: "PRODUCT_TYPE", value: "shirt" }],
  requestedEffects: ["DISCOVER_PRODUCTS", "ADD_TO_CART"],
};
const emptyCart = {
  id: null,
  items: [],
  totalQuantity: 0,
  subtotalMinor: 0,
  currency: "INR",
};

function intentAnalysisFor(intentBrief: IntentBrief): IntentAnalysis {
  const { constraints, ...analysis } = intentBrief;
  return {
    ...analysis,
    constraintDelta: { set: constraints, clear: [] },
  };
}

const enforcedBriefConstraints = {
  productTypes: brief.constraints.productTypes,
  useCases: brief.constraints.useCases,
  features: brief.constraints.features,
  category: brief.constraints.category ?? undefined,
  maxPriceMinor: brief.constraints.maxPriceMinor ?? undefined,
  size: brief.constraints.size ?? undefined,
  inStockOnly: brief.constraints.inStockOnly,
  attributes: brief.constraints.attributes,
};

const unusedAgentLoop: CommerceAgentLoop = {
  async run() {
    throw new Error("not used");
  },
};

function catalogCompletion(message: string): CommerceAgentLoop {
  return {
    async run({ capabilities }) {
      assert.ok(capabilities.searchProducts);
      const result = await capabilities.searchProducts({
        query: "running shoes",
        limit: 8,
      });
      return {
        status: "COMPLETED",
        message,
        productIds: result.products.map(({ id }) => id),
      };
    },
  };
}

test("lets the Commerce Agent choose from only the permitted Catalog capabilities", async () => {
  const catalogSearches: unknown[] = [];
  const loop: CommerceAgentLoop = {
    async run({ capabilities }) {
      assert.deepEqual(Object.keys(capabilities).sort(), [
        "getProduct",
        "searchProducts",
      ]);
      assert.ok(capabilities.searchProducts);

      const result = await capabilities.searchProducts({
        query: "breathable road running shoes",
        inStockOnly: true,
        limit: 5,
      });

      return {
        status: "COMPLETED",
        message: "The StrideFlow pair matches your road-running needs.",
        productIds: result.products.map(({ id }) => id),
      };
    },
  };
  const agent = createCommerceAgent(
    {
      async search(input) {
        catalogSearches.push(input);
        return { products: [product] };
      },
      async getProduct() {
        throw new Error("not used");
      },
    },
    { async analyze() { return intentAnalysisFor(brief); } },
    {
      async startTurn() {
        return {
          conversationId,
          async recordIntentBrief() {},
          async complete() {},
        };
      },
    },
    { agentLoop: loop },
  );

  const outcome = await agent.respond({
    message: "I need breathable road-running shoes under ₹5,000 in UK 9",
  });

  assert.deepEqual(catalogSearches, [
    {
      query: "breathable road running shoes",
      ...enforcedBriefConstraints,
      limit: 5,
    },
  ]);
  assert.deepEqual(outcome, {
    status: "COMPLETED",
    conversationId,
    message: "The StrideFlow pair matches your road-running needs.",
    intentBrief: brief,
    products: [product],
  });
});

test("does not expose Catalog capabilities for an ambiguous Cart addition", async () => {
  const nonDiscoveryBrief: IntentBrief = {
    ...brief,
    requestedEffects: ["ADD_TO_CART"],
  };
  const loop: CommerceAgentLoop = {
    async run() { throw new Error("Cart additions must not use the model loop"); },
  };
  const agent = createCommerceAgent(
    {
      async search() { throw new Error("Catalog search must not be exposed"); },
      async getProduct() { throw new Error("Product lookup must not be exposed"); },
    },
    { async analyze() { return intentAnalysisFor(nonDiscoveryBrief); } },
    {
      async startTurn() {
        return {
          conversationId,
          async recordIntentBrief() {},
          async complete() {},
        };
      },
    },
    {
      agentLoop: loop,
      cart: {
        async addItem() { throw new Error("Ambiguous requests must not mutate"); },
        async inspect() {
          return {
            id: null,
            items: [],
            totalQuantity: 0,
            subtotalMinor: 0,
            currency: "INR",
          };
        },
      },
    },
  );

  const outcome = await agent.respond({ message: "add it to my cart" });

  assert.equal(outcome.status, "NEEDS_INPUT");
});

test("revalidates a referenced Product before a non-discovery follow-up action", async () => {
  const currentProduct = { ...product, priceMinor: 429900, inStock: true };
  const referencedBrief: IntentBrief = {
    ...brief,
    requestedEffects: ["ADD_TO_CART"],
    referencedProductIds: [product.id],
  };
  const lookedUpProductIds: string[] = [];
  const addedProducts: CatalogProduct[] = [];
  const updatedCart = {
    id: "31000000-0000-4000-8000-000000000001",
    items: [{
      productId: product.id,
      productName: product.name,
      quantity: 1,
      cartPriceMinor: currentProduct.priceMinor,
      subtotalMinor: currentProduct.priceMinor,
    }],
    totalQuantity: 1,
    subtotalMinor: currentProduct.priceMinor,
    currency: currentProduct.currency,
  };
  const agent = createCommerceAgent(
    {
      async search() { throw new Error("Catalog search must not be exposed"); },
      async getProduct(productId) {
        lookedUpProductIds.push(productId);
        return { ok: true, value: currentProduct };
      },
    },
    { async analyze() { return intentAnalysisFor(referencedBrief); } },
    {
      async startTurn() {
        return {
          conversationId,
          context: {
            ...createEmptyConversationContext(),
            latestRecommendationSet: [
              {
                productId: product.id,
                name: product.name,
                description: product.description,
                category: product.category,
              },
            ],
          },
          async recordIntentBrief() {},
          async complete() {},
        };
      },
    },
    {
      agentLoop: {
        async run() { throw new Error("Cart additions must not use the model loop"); },
      },
      cart: {
        async addItem(current) {
          addedProducts.push(current);
          return updatedCart;
        },
        async inspect() { return updatedCart; },
      },
    },
  );

  const outcome = await agent.respond({ message: "add the first one" });

  assert.deepEqual(lookedUpProductIds, [product.id]);
  assert.deepEqual(addedProducts, [currentProduct]);
  assert.deepEqual(outcome.products, []);
  assert.deepEqual(outcome.cart, updatedCart);
});

test("adds the only Catalog Product matching a direct Cart request", async () => {
  const updatedCart = {
    id: "31000000-0000-4000-8000-000000000001",
    items: [{
      productId: blackShirt.id,
      productName: blackShirt.name,
      quantity: 1,
      cartPriceMinor: blackShirt.priceMinor,
      subtotalMinor: blackShirt.priceMinor,
    }],
    totalQuantity: 1,
    subtotalMinor: blackShirt.priceMinor,
    currency: blackShirt.currency,
  };
  const searches: unknown[] = [];
  const additions: CatalogProduct[] = [];
  const transaction = {} as Parameters<
    Parameters<NonNullable<Parameters<typeof createCommerceAgent>[3]["cart"]>["addItem"]>[2]
  >[1];
  let completedTransaction: unknown;
  const agent = createCommerceAgent(
    {
      async search(input) {
        searches.push(input);
        return { products: [blackShirt] };
      },
      async getProduct() { throw new Error("Direct additions use search results"); },
    },
    { async analyze() { return intentAnalysisFor(directAddBrief); } },
    {
      async startTurn() {
        return {
          conversationId,
          async recordIntentBrief() {},
          async complete(_message, _outcome, completedWith) {
            completedTransaction = completedWith;
          },
        };
      },
    },
    {
      agentLoop: {
        async run() { throw new Error("The model must not select a direct match"); },
      },
      cart: {
        async addItem(current, quantity, complete) {
          additions.push(current);
          assert.equal(quantity, 1);
          await complete(updatedCart, transaction);
          return updatedCart;
        },
        async inspect() { throw new Error("Successful additions do not inspect"); },
      },
    },
  );

  const outcome = await agent.respond({ message: "add a black shirt" });

  assert.deepEqual(searches, [{
    productTypes: ["shirt"],
    category: "Apparel",
    inStockOnly: true,
    attributes: { color: "Black" },
    limit: 2,
  }]);
  assert.deepEqual(additions, [blackShirt]);
  assert.equal(completedTransaction, transaction);
  assert.deepEqual(outcome, {
    status: "COMPLETED",
    conversationId,
    message: "Added 1 × Everyday Black Shirt to your Cart.",
    intentBrief: directAddBrief,
    products: [],
    cart: updatedCart,
  });
});

test("shows matching Products without changing the Cart when a direct addition is ambiguous", async () => {
  const blackShirts = [blackShirt, formalBlackShirt];
  let inspected = 0;
  let recordedRecommendationSet: CatalogProduct[] | undefined;
  const agent = createCommerceAgent(
    {
      async search() { return { products: blackShirts }; },
      async getProduct() { throw new Error("Ambiguous additions do not look up"); },
    },
    { async analyze() { return intentAnalysisFor(directAddBrief); } },
    {
      async startTurn() {
        return {
          conversationId,
          async recordIntentBrief() {},
          async recordRecommendationSet(products) {
            recordedRecommendationSet = products;
          },
          async complete() {},
        };
      },
    },
    {
      agentLoop: {
        async run() { throw new Error("The model must not choose among matches"); },
      },
      cart: {
        async addItem() { throw new Error("Ambiguous additions must not mutate"); },
        async inspect() {
          inspected += 1;
          return emptyCart;
        },
      },
    },
  );

  const outcome = await agent.respond({ message: "add a black shirt" });

  assert.equal(inspected, 1);
  assert.deepEqual(recordedRecommendationSet, blackShirts);
  assert.deepEqual(outcome, {
    status: "NEEDS_INPUT",
    conversationId,
    message: "I found multiple Products matching that Cart request.",
    question: "Which Product would you like to add?",
    missingInformation: ["Unambiguous Product"],
    intentBrief: directAddBrief,
    products: blackShirts,
    cart: emptyCart,
  });
});

test("explains that no Product matches a direct addition and leaves the Cart unchanged", async () => {
  let inspected = 0;
  const agent = createCommerceAgent(
    {
      async search() { return { products: [] }; },
      async getProduct() { throw new Error("Missing Products do not look up"); },
    },
    { async analyze() { return intentAnalysisFor(directAddBrief); } },
    {
      async startTurn() {
        return {
          conversationId,
          async recordIntentBrief() {},
          async complete() {},
        };
      },
    },
    {
      agentLoop: {
        async run() { throw new Error("The model must not invent a match"); },
      },
      cart: {
        async addItem() { throw new Error("Missing Products must not mutate"); },
        async inspect() {
          inspected += 1;
          return emptyCart;
        },
      },
    },
  );

  const outcome = await agent.respond({ message: "add a black shirt" });

  assert.equal(inspected, 1);
  assert.deepEqual(outcome, {
    status: "COMPLETED",
    conversationId,
    message: "I couldn't find a Product matching that Cart request.",
    intentBrief: directAddBrief,
    products: [],
    cart: emptyCart,
  });
});

test("does not add a Product when the Catalog reports more matching pages", async () => {
  const agent = createCommerceAgent(
    {
      async search() {
        return { products: [blackShirt], nextCursor: blackShirt.id };
      },
      async getProduct() { throw new Error("Paginated matches do not look up"); },
    },
    { async analyze() { return intentAnalysisFor(directAddBrief); } },
    {
      async startTurn() {
        return {
          conversationId,
          async recordIntentBrief() {},
          async recordRecommendationSet() {},
          async complete() {},
        };
      },
    },
    {
      agentLoop: {
        async run() { throw new Error("The model must not choose a paginated match"); },
      },
      cart: {
        async addItem() { throw new Error("Paginated matches must not mutate"); },
        async inspect() { return emptyCart; },
      },
    },
  );

  const outcome = await agent.respond({ message: "add a black shirt" });

  assert.equal(outcome.status, "NEEDS_INPUT");
  assert.deepEqual(outcome.products, [blackShirt]);
  assert.deepEqual(outcome.cart, emptyCart);
});

test("returns a retryable outcome when ambiguous direct matches cannot be retained", async () => {
  const agent = createCommerceAgent(
    {
      async search() { return { products: [blackShirt, formalBlackShirt] }; },
      async getProduct() { throw new Error("Ambiguous additions do not look up"); },
    },
    { async analyze() { return intentAnalysisFor(directAddBrief); } },
    {
      async startTurn() {
        return {
          conversationId,
          async recordIntentBrief() {},
          async recordRecommendationSet() { return false; },
          async complete() {},
        };
      },
    },
    {
      agentLoop: {
        async run() { throw new Error("The model must not choose among matches"); },
      },
      cart: {
        async addItem() { throw new Error("Ambiguous additions must not mutate"); },
        async inspect() { throw new Error("Stale outcomes do not inspect"); },
      },
    },
  );

  const outcome = await agent.respond({ message: "add a black shirt" });

  assert.deepEqual(outcome, {
    status: "TEMPORARILY_UNAVAILABLE",
    conversationId,
    message: "That conversation changed. Please retry your request.",
    retryable: true,
    products: [],
  });
});

test("bounds Catalog search inputs and results exposed to the Commerce Agent", async () => {
  const catalogProducts = Array.from({ length: 12 }, (_, index) => ({
    ...product,
    id: `21000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    name: `Running Shoe ${index + 1}`,
  }));
  const catalogSearches: Array<{ limit: number }> = [];
  const loop: CommerceAgentLoop = {
    async run({ capabilities }) {
      assert.ok(capabilities.searchProducts);
      const result = await capabilities.searchProducts({
        query: "running shoes",
        limit: 100,
      });
      assert.equal(result.products.length, 8);
      assert.equal(result.nextCursor, "catalog-cursor");
      return {
        status: "COMPLETED",
        message: "I found eight grounded options.",
        productIds: result.products.map(({ id }) => id),
      };
    },
  };
  const agent = createCommerceAgent(
    {
      async search(input) {
        catalogSearches.push(input);
        return { products: catalogProducts, nextCursor: "catalog-cursor" };
      },
      async getProduct() { throw new Error("not used"); },
    },
    { async analyze() { return intentAnalysisFor(brief); } },
    {
      async startTurn() {
        return {
          conversationId,
          async recordIntentBrief() {},
          async complete() {},
        };
      },
    },
    {
      agentLoop: loop,
      limits: {
        maxSteps: 50,
        timeoutMs: 150_000,
        maxOutputTokens: 20_000,
        maxToolProducts: 80,
      },
    },
  );

  const outcome = await agent.respond({ message: "show me running shoes" });

  assert.deepEqual(catalogSearches, [
    { query: "running shoes", ...enforcedBriefConstraints, limit: 8 },
  ]);
  assert.equal(outcome.products.length, 8);
});

test("runs the Commerce Agent with fixed step, timeout, token, and tool-result limits", async () => {
  const loop: CommerceAgentLoop = {
    async run({ limits, signal }) {
      assert.deepEqual(limits, {
        maxSteps: 5,
        timeoutMs: 15_000,
        maxOutputTokens: 2_000,
        maxToolProducts: 8,
      });
      assert.equal(signal.aborted, false);
      return {
        status: "NEEDS_INPUT",
        message: "Which running surface do you prefer?",
        question: "Which running surface do you prefer?",
        missingInformation: ["running surface"],
      };
    },
  };
  const agent = createCommerceAgent(
    {
      async search() { throw new Error("not used"); },
      async getProduct() { throw new Error("not used"); },
    },
    { async analyze() { return intentAnalysisFor(brief); } },
    {
      async startTurn() {
        return {
          conversationId,
          async recordIntentBrief() {},
          async complete() {},
        };
      },
    },
    {
      agentLoop: loop,
      limits: {
        maxSteps: 50,
        timeoutMs: 150_000,
        maxOutputTokens: 20_000,
        maxToolProducts: 80,
      },
    },
  );

  const outcome = await agent.respond({ message: "show me running shoes" });

  assert.equal(outcome.status, "NEEDS_INPUT");
});

test("stops an uncooperative agent loop and returns the best grounded Product outcome on timeout", async () => {
  const loop: CommerceAgentLoop = {
    async run({ capabilities }) {
      assert.ok(capabilities.searchProducts);
      await capabilities.searchProducts({ query: "running shoes", limit: 3 });
      await new Promise((resolve) => setTimeout(resolve, 40));
      return {
        status: "COMPLETED",
        message: "A late response that must be ignored.",
        productIds: [product.id],
      };
    },
  };
  const agent = createCommerceAgent(
    {
      async search() { return { products: [product] }; },
      async getProduct() { throw new Error("not used"); },
    },
    { async analyze() { return intentAnalysisFor(brief); } },
    {
      async startTurn() {
        return {
          conversationId,
          async recordIntentBrief() {},
          async complete() {},
        };
      },
    },
    {
      agentLoop: loop,
      limits: {
        maxSteps: 5,
        timeoutMs: 5,
        maxOutputTokens: 2_000,
        maxToolProducts: 8,
      },
    },
  );

  const outcome = await agent.respond({ message: "show me running shoes" });

  assert.deepEqual(outcome, {
    status: "COMPLETED",
    conversationId,
    message: "I found 1 Product before the search reached its limit.",
    intentBrief: brief,
    products: [product],
  });
});

test("denies Catalog calls attempted after the agent loop timeout", async () => {
  let searches = 0;
  const loop: CommerceAgentLoop = {
    async run({ capabilities }) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      assert.ok(capabilities.searchProducts);
      await capabilities.searchProducts({ query: "late search", limit: 1 });
      return {
        status: "COMPLETED",
        message: "This late response must be ignored.",
        productIds: [],
      };
    },
  };
  const agent = createCommerceAgent(
    {
      async search() {
        searches += 1;
        return { products: [product] };
      },
      async getProduct() { throw new Error("not used"); },
    },
    { async analyze() { return intentAnalysisFor(brief); } },
    {
      async startTurn() {
        return {
          conversationId,
          async recordIntentBrief() {},
          async complete() {},
        };
      },
    },
    {
      agentLoop: loop,
      limits: {
        maxSteps: 5,
        timeoutMs: 5,
        maxOutputTokens: 2_000,
        maxToolProducts: 8,
      },
    },
  );

  const outcome = await agent.respond({ message: "show me running shoes" });
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(outcome.status, "NEEDS_INPUT");
  assert.equal(searches, 0);
});

test("returns NEEDS_INPUT when a step or token limit is reached without grounded Products", async () => {
  const loop: CommerceAgentLoop = {
    async run() {
      return { status: "LIMIT_REACHED" };
    },
  };
  const agent = createCommerceAgent(
    {
      async search() { throw new Error("not used"); },
      async getProduct() { throw new Error("not used"); },
    },
    { async analyze() { return intentAnalysisFor(brief); } },
    {
      async startTurn() {
        return {
          conversationId,
          async recordIntentBrief() {},
          async complete() {},
        };
      },
    },
    { agentLoop: loop },
  );

  const outcome = await agent.respond({ message: "show me running shoes" });

  assert.deepEqual(outcome, {
    status: "NEEDS_INPUT",
    conversationId,
    message: "Could you narrow the Product type or try the search again?",
    question: "Could you narrow the Product type or try the search again?",
    missingInformation: ["Product preferences"],
    intentBrief: brief,
    products: [],
  });
});

test("rejects a model completion that references an unobserved Product", async () => {
  const loop: CommerceAgentLoop = {
    async run() {
      return {
        status: "COMPLETED",
        message: "The invented CloudRunner Pro is the best choice.",
        productIds: ["21000000-0000-4000-8000-000000000099"],
      };
    },
  };
  const agent = createCommerceAgent(
    {
      async search() { throw new Error("not used"); },
      async getProduct() { throw new Error("not used"); },
    },
    { async analyze() { return intentAnalysisFor(brief); } },
    {
      async startTurn() {
        return {
          conversationId,
          async recordIntentBrief() {},
          async complete() {},
        };
      },
    },
    { agentLoop: loop },
  );

  const outcome = await agent.respond({ message: "show me running shoes" });

  assert.deepEqual(outcome, {
    status: "NEEDS_INPUT",
    conversationId,
    message: "Could you narrow the Product type or try the search again?",
    question: "Could you narrow the Product type or try the search again?",
    missingInformation: ["Product preferences"],
    intentBrief: brief,
    products: [],
  });
});

test("executes an AI-selected Catalog search through the bounded tool loop", async () => {
  const usage = {
    inputTokens: { total: 20, noCache: 20, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 20, text: 20, reasoning: 0 },
  };
  const model = new MockLanguageModelV4({
    doGenerate: [
      {
        content: [
          {
            type: "tool-call",
            toolCallId: "catalog-search-1",
            toolName: "searchProducts",
            input: JSON.stringify({
              query: "breathable road running shoes",
              limit: 5,
            }),
          },
        ],
        finishReason: { unified: "tool-calls", raw: undefined },
        usage,
        warnings: [],
      },
      {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "COMPLETED",
              message: "The StrideFlow pair matches your road-running needs.",
              productIds: [product.id],
              question: null,
              missingInformation: [],
            }),
          },
        ],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        warnings: [],
      },
    ],
  });
  const catalogSearches: unknown[] = [];
  const agent = createCommerceAgent(
    {
      async search(input) {
        catalogSearches.push(input);
        return { products: [product] };
      },
      async getProduct() { throw new Error("not used"); },
    },
    { async analyze() { return intentAnalysisFor(brief); } },
    {
      async startTurn() {
        return {
          conversationId,
          async recordIntentBrief() {},
          async complete() {},
        };
      },
    },
    { agentLoop: createAiCommerceAgentLoop(model) },
  );

  const outcome = await agent.respond({ message: "show me running shoes" });

  assert.deepEqual(model.doGenerateCalls[0].prompt.slice(1), [
    {
      role: "user",
      providerOptions: undefined,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            customerMessage: "show me running shoes",
            intentBrief: brief,
          }),
        },
      ],
    },
  ]);
  assert.deepEqual(catalogSearches, [
    {
      query: "breathable road running shoes",
      ...enforcedBriefConstraints,
      limit: 5,
    },
  ]);
  assert.deepEqual(outcome, {
    status: "COMPLETED",
    conversationId,
    message: "The StrideFlow pair matches your road-running needs.",
    intentBrief: brief,
    products: [product],
  });
});

test("uses a grounded fallback when the AI SDK returns output at the five-step limit", async () => {
  const usage = {
    inputTokens: { total: 20, noCache: 20, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 20, text: 20, reasoning: 0 },
  };
  const model = new MockLanguageModelV4({
    doGenerate: [
      ...Array.from({ length: 4 }, (_, index) => ({
        content: [
          {
            type: "tool-call" as const,
            toolCallId: `catalog-search-${index + 1}`,
            toolName: "searchProducts",
            input: JSON.stringify({ query: "running shoes", limit: 1 }),
          },
        ],
        finishReason: { unified: "tool-calls" as const, raw: undefined },
        usage,
        warnings: [],
      })),
      {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "COMPLETED",
              message: "The invented CloudRunner Pro is the best choice.",
              productIds: [],
              question: null,
              missingInformation: [],
            }),
          },
        ],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        warnings: [],
      },
    ],
  });
  let searches = 0;
  const agent = createCommerceAgent(
    {
      async search() {
        searches += 1;
        return { products: [product] };
      },
      async getProduct() { throw new Error("not used"); },
    },
    { async analyze() { return intentAnalysisFor(brief); } },
    {
      async startTurn() {
        return {
          conversationId,
          async recordIntentBrief() {},
          async complete() {},
        };
      },
    },
    { agentLoop: createAiCommerceAgentLoop(model) },
  );

  const outcome = await agent.respond({ message: "keep searching forever" });

  assert.equal(model.doGenerateCalls.length, 5);
  assert.equal(searches, 4);
  assert.deepEqual(outcome, {
    status: "COMPLETED",
    conversationId,
    message: "I found 1 Product before the search reached its limit.",
    intentBrief: brief,
    products: [product],
  });
});

test("stops the AI SDK tool loop at its cumulative output-token budget", async () => {
  const usage = {
    inputTokens: { total: 20, noCache: 20, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1_100, text: 1_100, reasoning: 0 },
  };
  const model = new MockLanguageModelV4({
    doGenerate: Array.from({ length: 5 }, (_, index) => ({
      content: [
        {
          type: "tool-call" as const,
          toolCallId: `catalog-search-${index + 1}`,
          toolName: "searchProducts",
          input: JSON.stringify({ query: "running shoes", limit: 1 }),
        },
      ],
      finishReason: { unified: "tool-calls" as const, raw: undefined },
      usage,
      warnings: [],
    })),
  });
  const agent = createCommerceAgent(
    {
      async search() { return { products: [product] }; },
      async getProduct() { throw new Error("not used"); },
    },
    { async analyze() { return intentAnalysisFor(brief); } },
    {
      async startTurn() {
        return {
          conversationId,
          async recordIntentBrief() {},
          async complete() {},
        };
      },
    },
    { agentLoop: createAiCommerceAgentLoop(model) },
  );

  const outcome = await agent.respond({ message: "keep searching forever" });

  assert.equal(model.doGenerateCalls.length, 2);
  assert.equal(model.doGenerateCalls[0].maxOutputTokens, 2_000);
  assert.equal(model.doGenerateCalls[1].maxOutputTokens, 900);
  assert.equal(outcome.status, "COMPLETED");
  assert.deepEqual(outcome.products, [product]);
});

test("returns a COMPLETED outcome with trusted Products and agent-composed language", async () => {
  const persisted: {
    intentBrief?: IntentBrief;
    outcome?: AgentOutcome;
  } = {};
  const analyzer: IntentAnalyzer = {
    async analyze() { return intentAnalysisFor(brief); },
  };
  const catalog: CatalogModule = {
    async search() { return { products: [product] }; },
    async getProduct() { throw new Error("not used"); },
  };
  const conversation: ConversationModule = {
    async startTurn() {
      return {
        conversationId,
        async recordIntentBrief(intentBrief) { persisted.intentBrief = intentBrief; },
        async complete(_message, outcome) { persisted.outcome = outcome; },
      };
    },
  };
  const agent = createCommerceAgent(catalog, analyzer, conversation, {
    agentLoop: catalogCompletion(
      "The StrideFlow pair fits your road runs, budget, and UK 9 size.",
    ),
  });
  const outcome = await agent.respond({
    message: "I need breathable road-running shoes under ₹5,000 in UK 9",
  });

  assert.deepEqual(outcome, {
    status: "COMPLETED",
    conversationId,
    message: "The StrideFlow pair fits your road runs, budget, and UK 9 size.",
    intentBrief: brief,
    products: [product],
  });
  assert.deepEqual(persisted, { intentBrief: brief, outcome });
});

test("returns NEEDS_INPUT with one focused question for a genuinely ambiguous request", async () => {
  const ambiguousBrief: IntentBrief = {
    ...brief,
    goal: "Find a gift",
    constraints: {
      ...brief.constraints,
      productTypes: [],
      useCases: ["gift"],
      features: [],
      category: null,
      maxPriceMinor: null,
      size: null,
      attributes: {},
    },
    knownEntities: [],
    missingInformation: ["recipient interests"],
    confidence: 0.45,
  };
  let searched = false;
  let persistedOutcome: AgentOutcome | undefined;
  const agent = createCommerceAgent(
    {
      async search() { searched = true; return { products: [] }; },
      async getProduct() { throw new Error("not used"); },
    },
    { async analyze() { return intentAnalysisFor(ambiguousBrief); } },
    {
      async startTurn() {
        return {
          conversationId,
          async recordIntentBrief() {},
          async complete(_message, outcome) { persistedOutcome = outcome; },
        };
      },
    },
    {
      agentLoop: {
        async run() {
          return {
            status: "NEEDS_INPUT",
            message: "What kinds of things is the recipient interested in?",
            question: "What kinds of things is the recipient interested in?",
            missingInformation: ["recipient interests"],
          };
        },
      },
    },
  );

  const outcome = await agent.respond({ message: "I need a gift" });

  assert.deepEqual(outcome, {
    status: "NEEDS_INPUT",
    conversationId,
    message: "What kinds of things is the recipient interested in?",
    question: "What kinds of things is the recipient interested in?",
    missingInformation: ["recipient interests"],
    intentBrief: ambiguousBrief,
    products: [],
  });
  assert.equal(searched, false);
  assert.deepEqual(persistedOutcome, outcome);
});

test("returns a retryable typed outcome when Intent analysis stays unavailable", async () => {
  let persistedOutcome: AgentOutcome | undefined;
  const agent = createCommerceAgent(
    {
      async search() { throw new Error("not used"); },
      async getProduct() { throw new Error("not used"); },
    },
    { async analyze() { throw new Error("model unavailable"); } },
    {
      async startTurn() {
        return {
          conversationId,
          async recordIntentBrief() {},
          async complete(_message, outcome) { persistedOutcome = outcome; },
        };
      },
    },
    { agentLoop: unusedAgentLoop },
  );

  const outcome = await agent.respond({ message: "show me running shoes" });

  assert.deepEqual(outcome, {
    status: "TEMPORARILY_UNAVAILABLE",
    conversationId,
    message: "I couldn't understand that request right now. Please try again.",
    retryable: true,
    products: [],
  });
  assert.deepEqual(persistedOutcome, outcome);
});

test("returns a retryable typed outcome when conversation persistence cannot start", async () => {
  const agent = createCommerceAgent(
    {
      async search() { throw new Error("not used"); },
      async getProduct() { throw new Error("not used"); },
    },
    { async analyze() { throw new Error("not used"); } },
    {
      async startTurn() { throw new Error("database unavailable"); },
    },
    { agentLoop: unusedAgentLoop },
  );

  const outcome = await agent.respond({ message: "show me running shoes" });

  assert.deepEqual(outcome, {
    status: "TEMPORARILY_UNAVAILABLE",
    message: "I couldn't start that conversation right now. Please try again.",
    retryable: true,
    products: [],
  });
});

test("returns a retryable typed outcome when discovery infrastructure fails", async () => {
  let persistedOutcome: AgentOutcome | undefined;
  const agent = createCommerceAgent(
    {
      async search() { throw new Error("catalog unavailable"); },
      async getProduct() { throw new Error("not used"); },
    },
    { async analyze() { return intentAnalysisFor(brief); } },
    {
      async startTurn() {
        return {
          conversationId,
          async recordIntentBrief() {},
          async complete(_message, outcome) { persistedOutcome = outcome; },
        };
      },
    },
    {
      agentLoop: catalogCompletion("This response will not be reached."),
    },
  );

  const outcome = await agent.respond({ message: "show me running shoes" });

  assert.deepEqual(outcome, {
    status: "TEMPORARILY_UNAVAILABLE",
    conversationId,
    message: "Product discovery is temporarily unavailable. Please try again.",
    retryable: true,
    intentBrief: brief,
    products: [],
  });
  assert.deepEqual(persistedOutcome, outcome);
});

test("returns a retryable typed outcome when the agent loop fails", async () => {
  const ambiguousBrief: IntentBrief = {
    ...brief,
    missingInformation: ["recipient interests"],
  };
  let persistedOutcome: AgentOutcome | undefined;
  const agent = createCommerceAgent(
    {
      async search() { throw new Error("not used"); },
      async getProduct() { throw new Error("not used"); },
    },
    { async analyze() { return intentAnalysisFor(ambiguousBrief); } },
    {
      async startTurn() {
        return {
          conversationId,
          async recordIntentBrief() {},
          async complete(_message, outcome) { persistedOutcome = outcome; },
        };
      },
    },
    { agentLoop: unusedAgentLoop },
  );

  const outcome = await agent.respond({ message: "I need a gift" });

  assert.deepEqual(outcome, {
    status: "TEMPORARILY_UNAVAILABLE",
    conversationId,
    message: "Product discovery is temporarily unavailable. Please try again.",
    retryable: true,
    intentBrief: ambiguousBrief,
    products: [],
  });
  assert.deepEqual(persistedOutcome, outcome);
});

test("returns a retryable typed outcome when Intent Brief persistence fails", async () => {
  let persistedOutcome: AgentOutcome | undefined;
  const agent = createCommerceAgent(
    {
      async search() { throw new Error("not used"); },
      async getProduct() { throw new Error("not used"); },
    },
    { async analyze() { return intentAnalysisFor(brief); } },
    {
      async startTurn() {
        return {
          conversationId,
          async recordIntentBrief() { throw new Error("database unavailable"); },
          async complete(_message, outcome) { persistedOutcome = outcome; },
        };
      },
    },
    { agentLoop: unusedAgentLoop },
  );

  const outcome = await agent.respond({ message: "show me running shoes" });

  assert.deepEqual(outcome, {
    status: "TEMPORARILY_UNAVAILABLE",
    conversationId,
    message: "I couldn't save that request right now. Please try again.",
    retryable: true,
    intentBrief: brief,
    products: [],
  });
  assert.deepEqual(persistedOutcome, outcome);
});

test("returns a retryable typed outcome when Agent Outcome persistence fails", async () => {
  const agent = createCommerceAgent(
    {
      async search() { return { products: [product] }; },
      async getProduct() { throw new Error("not used"); },
    },
    { async analyze() { return intentAnalysisFor(brief); } },
    {
      async startTurn() {
        return {
          conversationId,
          async recordIntentBrief() {},
          async complete() { throw new Error("database unavailable"); },
        };
      },
    },
    { agentLoop: catalogCompletion("A grounded recommendation.") },
  );

  const outcome = await agent.respond({ message: "show me running shoes" });

  assert.deepEqual(outcome, {
    status: "TEMPORARILY_UNAVAILABLE",
    conversationId,
    message: "I couldn't save that response right now. Please try again.",
    retryable: true,
    intentBrief: brief,
    products: [],
  });
});

test("persists the Intent Brief and Agent Outcome as inspectable turn metadata", async () => {
  const metadataUpdates: Array<{ messageId: string; metadata: unknown }> = [];
  const appended: Array<{ role: string; content: string; metadata: unknown }> = [];
  const repository: ConversationRepository = {
    async findDuplicate() { return null; },
    async create() {
      return {
        conversationId,
        userMessageId: "51000000-0000-4000-8000-000000000001",
        context: createEmptyConversationContext(),
      };
    },
    async findOwnedContext() { return null; },
    async saveContextAndMetadata(
      _conversationId,
      _context,
      messageId,
      metadata,
    ) {
      metadataUpdates.push({ messageId, metadata });
    },
    async append(_conversationId, role, content, metadata) {
      appended.push({ role, content, metadata });
      return "51000000-0000-4000-8000-000000000002";
    },
  };
  const agent = createCommerceAgent(
    {
      async search() { return { products: [product] }; },
      async getProduct() { throw new Error("not used"); },
    },
    { async analyze() { return intentAnalysisFor(brief); } },
    createConversationModule(
      "11000000-0000-4000-8000-000000000001",
      repository,
    ),
    { agentLoop: catalogCompletion("A grounded recommendation.") },
  );

  const outcome = await agent.respond({ message: "show me running shoes" });
  const persistedBrief: IntentBrief = {
    ...brief,
    goal: "Discover Products",
    constraints: { ...brief.constraints, attributes: {} },
  };

  assert.deepEqual(metadataUpdates, [
    {
      messageId: "51000000-0000-4000-8000-000000000001",
      metadata: { intentBrief: persistedBrief },
    },
  ]);
  assert.deepEqual(appended, [
    {
      role: "ASSISTANT",
      content: "Product discovery completed.",
      metadata: {
        agentOutcome: {
          ...outcome,
          message: "Product discovery completed.",
          intentBrief: persistedBrief,
        },
      },
    },
  ]);
});

test("continues a Conversation only for its owning Guest Session", async () => {
  const appendedMessages: string[] = [];
  const repository: ConversationRepository = {
    async findDuplicate() { return null; },
    async create() {
      throw new Error("not used");
    },
    async findOwnedContext() {
      return {
        guestSessionId: "11000000-0000-4000-8000-000000000001",
        context: createEmptyConversationContext(),
      };
    },
    async saveContextAndMetadata() {},
    async append(_conversationId, _role, content) {
      appendedMessages.push(content);
      return "51000000-0000-4000-8000-000000000002";
    },
  };
  const conversation = createConversationModule(
    "11000000-0000-4000-8000-000000000001",
    repository,
  );

  await conversation.startTurn({
    conversationId,
    idempotencyKey: crypto.randomUUID(),
    message: "show me more like those",
  });

  assert.deepEqual(appendedMessages, ["show me more like those"]);
});

test("redacts sensitive Customer text before durable Transcript persistence", async () => {
  const persistedMessages: string[] = [];
  const repository: ConversationRepository = {
    async findDuplicate() { return null; },
    async create(_owner, message) {
      persistedMessages.push(message);
      return {
        conversationId,
        userMessageId: "51000000-0000-4000-8000-000000000001",
        context: createEmptyConversationContext(),
      };
    },
    async findOwnedContext() {
      return {
        guestSessionId: "11000000-0000-4000-8000-000000000001",
        context: createEmptyConversationContext(),
      };
    },
    async saveContextAndMetadata() {},
    async append(_conversationId, role, content) {
      if (role === "USER") persistedMessages.push(content);
      return "51000000-0000-4000-8000-000000000002";
    },
  };
  const conversation = createConversationModule(
    "11000000-0000-4000-8000-000000000001",
    repository,
  );

  await conversation.startTurn({
    idempotencyKey: crypto.randomUUID(),
    message:
      "shoes for jane.private@example.com, contact me at +91 98765 43210, OTP 654321",
  });
  await conversation.startTurn({
    conversationId,
    idempotencyKey: crypto.randomUUID(),
    message:
      "deliver to Flat 4B, 12 Main Street, PIN 560001; card 4111 1111 1111 1111, CVV 123, exp 12/29, UPI private@bank with token sk-private-secret",
  });

  assert.doesNotMatch(
    persistedMessages.join(" "),
    /jane\.private@example\.com|98765|654321|12 Main Street|560001|4111|CVV 123|12\/29|private@bank|sk-private-secret/,
  );
  assert.match(persistedMessages.join(" "), /REDACTED/);
});

test("excludes credentials and unnecessary personal data from persisted intent and outcome records", async () => {
  const metadataRecords: unknown[] = [];
  const sensitiveBrief: IntentBrief = {
    ...brief,
    goal:
      "Alice wants shoes at 12 Main Street; OTP 654321; contact jane.private@example.com; reasoning: hidden notes",
    constraints: {
      ...brief.constraints,
      attributes: {
        ...brief.constraints.attributes,
        homeAddress: "12 Main Street",
        recipientName: "Alice",
        deliveryAddress: "88 Private Avenue",
        customerFullName: "Alice Private",
        internalReasoningNotes: "hidden personal inference",
      },
    },
    knownEntities: [
      { type: "PRODUCT_TYPE", value: "running shoes" },
      { type: "PRODUCT", value: "API key sk-private-credential" },
    ],
  };
  const repository: ConversationRepository = {
    async findDuplicate() { return null; },
    async create() {
      return {
        conversationId,
        userMessageId: "51000000-0000-4000-8000-000000000001",
        context: createEmptyConversationContext(),
      };
    },
    async findOwnedContext() { return null; },
    async saveContextAndMetadata(
      _conversationId,
      _context,
      _messageId,
      metadata,
    ) {
      metadataRecords.push(metadata);
    },
    async append(_conversationId, _role, content, metadata) {
      metadataRecords.push({ content, metadata });
      return "51000000-0000-4000-8000-000000000002";
    },
  };
  const agent = createCommerceAgent(
    {
      async search() { return { products: [product] }; },
      async getProduct() { throw new Error("not used"); },
    },
    { async analyze() { return intentAnalysisFor(sensitiveBrief); } },
    createConversationModule(
      "11000000-0000-4000-8000-000000000001",
      repository,
    ),
    {
      agentLoop: catalogCompletion(
        "For jane.private@example.com, use token sk-private-credential.",
      ),
    },
  );

  await agent.respond({ message: "show me running shoes" });

  const persistedRecords = JSON.stringify(metadataRecords);
  assert.doesNotMatch(
    persistedRecords,
    /654321|jane\.private@example\.com|sk-private-credential|Alice|12 Main Street|88 Private Avenue|hidden notes|hidden personal inference/,
  );
  assert.doesNotMatch(persistedRecords, /chain.?of.?thought|reasoning/i);
});
