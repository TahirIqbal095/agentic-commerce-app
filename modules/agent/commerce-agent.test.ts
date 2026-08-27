import assert from "node:assert/strict";
import test from "node:test";
import type {
  CatalogModule,
  CatalogProduct,
  CatalogSearch,
} from "@/modules/catalog/catalog";
import {
  createCommerceAgent,
  type ConversationModule,
  type IntentInterpreter,
} from "./commerce-agent";
import {
  createConversationModule,
  type ConversationRepository,
} from "./conversation";

const conversationId = "41000000-0000-4000-8000-000000000001";
const conversation: ConversationModule = {
  async startTurn() {
    return { conversationId, async complete() {} };
  },
};

const runningShoes: CatalogProduct = {
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

test("turns a natural-language request into a related catalog search", async () => {
  const searches: CatalogSearch[] = [];
  const interpreter: IntentInterpreter = {
    async interpret() {
      return {
        productTypes: ["running shoes"],
        useCases: ["road running"],
        features: ["breathable"],
        category: "Footwear",
        minPriceMinor: null,
        maxPriceMinor: 500000,
        size: "UK 9",
        inStockOnly: true,
        attributes: { support: "Neutral" },
      };
    },
  };
  const catalog: CatalogModule = {
    async search(input) {
      searches.push(input);
      return { products: [runningShoes] };
    },
    async getProduct() {
      throw new Error("Not used by this behavior");
    },
  };

  const agent = createCommerceAgent(catalog, interpreter, conversation);
  const result = await agent.respond({
    message: "I need breathable road-running shoes under ₹5,000 in UK 9",
  });

  assert.deepEqual(searches, [
    {
      productTypes: ["running shoes"],
      useCases: ["road running"],
      features: ["breathable"],
      category: "Footwear",
      maxPriceMinor: 500000,
      size: "UK 9",
      inStockOnly: true,
      attributes: { support: "Neutral" },
      limit: 20,
    },
  ]);
  assert.deepEqual(result, {
    conversationId,
    message: "I found 1 product matching your request.",
    intent: {
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
    products: [runningShoes],
  });
});

test("explains when no catalog products match the interpreted request", async () => {
  const interpreter: IntentInterpreter = {
    async interpret() {
      return {
        productTypes: [],
        useCases: [],
        features: [],
        category: null,
        minPriceMinor: null,
        maxPriceMinor: null,
        size: null,
        inStockOnly: true,
        attributes: {},
      };
    },
  };
  const catalog: CatalogModule = {
    async search() {
      return { products: [] };
    },
    async getProduct() {
      throw new Error("Not used by this behavior");
    },
  };

  const agent = createCommerceAgent(catalog, interpreter, conversation);
  const result = await agent.respond({ message: "show me products" });

  assert.deepEqual(result, {
    conversationId,
    message:
      "I couldn't find products matching that request. Try a broader product type, feature, or price range.",
    intent: {
      productTypes: [],
      useCases: [],
      features: [],
      category: null,
      minPriceMinor: null,
      maxPriceMinor: null,
      size: null,
      inStockOnly: true,
      attributes: {},
    },
    products: [],
  });
});

test("resumes a conversation and appends USER and ASSISTANT messages in order", async () => {
  const entries: string[] = [];
  const owners = new Map<string, { userId: string; merchantId: string }>();
  const repository: ConversationRepository = {
    async create(owner, message) {
      owners.set(conversationId, owner);
      entries.push(`USER:${message}:new`);
      return conversationId;
    },
    async findOwner(id) {
      return owners.get(id) ?? null;
    },
    async append(id, role, message) {
      entries.push(`${role}:${message}:${id}`);
    },
  };
  const scopedConversation = createConversationModule(
    "12000000-0000-4000-8000-000000000001",
    "11111111-1111-4111-8111-111111111111",
    repository,
  );
  const interpreter: IntentInterpreter = { async interpret() { return { productTypes: [], useCases: [], features: [], category: null, minPriceMinor: null, maxPriceMinor: null, size: null, inStockOnly: true, attributes: {} }; } };
  const catalog: CatalogModule = { async search() { return { products: [] }; }, async getProduct() { throw new Error("Not used"); } };
  const agent = createCommerceAgent(catalog, interpreter, scopedConversation);

  const first = await agent.respond({ message: "show me lamps" });
  await agent.respond({ conversationId: first.conversationId, message: "only desk lamps" });

  assert.deepEqual(entries, [
    "USER:show me lamps:new",
    `ASSISTANT:I couldn't find products matching that request. Try a broader product type, feature, or price range.:${conversationId}`,
    `USER:only desk lamps:${conversationId}`,
    `ASSISTANT:I couldn't find products matching that request. Try a broader product type, feature, or price range.:${conversationId}`,
  ]);
});

test("rejects an out-of-scope conversation before interpretation", async () => {
  let interpreted = false;
  const repository: ConversationRepository = {
    async create() { throw new Error("not used"); },
    async findOwner() { return { userId: "another-user", merchantId: "11111111-1111-4111-8111-111111111111" }; },
    async append() { throw new Error("must not append"); },
  };
  const inaccessible = createConversationModule(
    "12000000-0000-4000-8000-000000000001",
    "11111111-1111-4111-8111-111111111111",
    repository,
  );
  const interpreter: IntentInterpreter = { async interpret() { interpreted = true; throw new Error("must not run"); } };
  const catalog = {} as CatalogModule;
  const agent = createCommerceAgent(catalog, interpreter, inaccessible);
  await assert.rejects(agent.respond({ conversationId, message: "more like those" }), /not found/);
  assert.equal(interpreted, false);
});
