import assert from "node:assert/strict";
import test from "node:test";
import type {
  CatalogModule,
  CatalogProduct,
  CatalogSearch,
} from "@/modules/catalog/catalog";
import {
  createLegacyCommerceAgent,
  type LegacyConversationModule,
  type IntentInterpreter,
} from "./commerce-agent";
import { CartError, type CartModule } from "@/modules/cart/cart";

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

const conversationId = "41000000-0000-4000-8000-000000000001";
const conversation: LegacyConversationModule = {
  async startTurn() {
    return {
      conversationId,
      async complete() {},
    };
  },
};

test("creates a server-owned conversation for the first customer message", async () => {
  const persistedMessages: Array<{ role: "USER" | "ASSISTANT"; content: string }> = [];
  const conversation = {
    async startTurn(input: { message: string }) {
      persistedMessages.push({ role: "USER", content: input.message });
      return {
        conversationId: "41000000-0000-4000-8000-000000000001",
        async complete(assistantMessage: string) {
          persistedMessages.push({ role: "ASSISTANT", content: assistantMessage });
        },
      };
    },
  };
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

  const agent = createLegacyCommerceAgent(catalog, interpreter, conversation);
  const result = await agent.respond({ message: "show me desk lamps" });

  assert.equal(
    result.conversationId,
    "41000000-0000-4000-8000-000000000001",
  );
  assert.deepEqual(persistedMessages, [
    { role: "USER", content: "show me desk lamps" },
    {
      role: "ASSISTANT",
      content:
        "I couldn't find products matching that request. Try a broader product type, feature, or price range.",
    },
  ]);
});

test("resumes a conversation and appends later messages in order", async () => {
  const requestedConversationIds: Array<string | undefined> = [];
  const persistedMessages: Array<{ role: "USER" | "ASSISTANT"; content: string }> = [];
  const orderedConversation = {
    async startTurn(input: { conversationId?: string; message: string }) {
      requestedConversationIds.push(input.conversationId);
      persistedMessages.push({ role: "USER", content: input.message });
      return {
        conversationId,
        async complete(assistantMessage: string) {
          persistedMessages.push({ role: "ASSISTANT", content: assistantMessage });
        },
      };
    },
  };
  const interpreter: IntentInterpreter = {
    async interpret(message) {
      return {
        productTypes: [message],
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
      return { products: [runningShoes] };
    },
    async getProduct() {
      throw new Error("Not used by this behavior");
    },
  };
  const agent = createLegacyCommerceAgent(catalog, interpreter, orderedConversation);

  const firstResult = await agent.respond({ message: "show me running shoes" });
  await agent.respond({
    conversationId: firstResult.conversationId,
    message: "only breathable ones",
  });

  assert.deepEqual(requestedConversationIds, [undefined, conversationId]);
  assert.deepEqual(persistedMessages, [
    { role: "USER", content: "show me running shoes" },
    {
      role: "ASSISTANT",
      content: "I found 1 product matching your request.",
    },
    { role: "USER", content: "only breathable ones" },
    {
      role: "ASSISTANT",
      content: "I found 1 product matching your request.",
    },
  ]);
});

test("rejects an out-of-scope conversation before interpreting the message", async () => {
  let interpreted = false;
  const inaccessibleConversation = {
    async startTurn() {
      throw new Error("The conversation was not found.");
    },
  };
  const interpreter: IntentInterpreter = {
    async interpret() {
      interpreted = true;
      throw new Error("The interpreter must not run");
    },
  };
  const catalog: CatalogModule = {
    async search() {
      throw new Error("The catalog must not be searched");
    },
    async getProduct() {
      throw new Error("The catalog must not be queried");
    },
  };
  const agent = createLegacyCommerceAgent(
    catalog,
    interpreter,
    inaccessibleConversation,
  );

  await assert.rejects(
    agent.respond({
      conversationId: "41000000-0000-4000-8000-000000000099",
      message: "show me more like those",
    }),
    /conversation was not found/,
  );
  assert.equal(interpreted, false);
});

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

  const agent = createLegacyCommerceAgent(catalog, interpreter, conversation);
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

  const agent = createLegacyCommerceAgent(catalog, interpreter, conversation);
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

test("adds a requested product to the customer's cart", async () => {
  const interpreter: IntentInterpreter = {
    async interpret() {
      return {
        action: "ADD_TO_CART",
        productName: "StrideFlow Daily Running Shoes",
        quantity: 2,
      };
    },
  };
  const catalog: CatalogModule = {
    async search(input) {
      assert.deepEqual(input, {
        query: "StrideFlow Daily Running Shoes",
        inStockOnly: true,
        limit: 2,
      });
      return { products: [runningShoes] };
    },
    async getProduct() {
      throw new Error("Not used by this behavior");
    },
  };
  const additions: Array<{ product: CatalogProduct; quantity: number }> = [];
  const cart: CartModule = {
    async addItem(product, quantity) {
      additions.push({ product, quantity });
      return {
        id: "31000000-0000-4000-8000-000000000001",
        totalQuantity: 2,
        subtotalMinor: 799800,
        currency: "INR",
      };
    },
  };

  const agent = createLegacyCommerceAgent(
    catalog,
    interpreter,
    conversation,
    cart,
  );
  const result = await agent.respond({
    message: "add two StrideFlow Daily Running Shoes to my cart",
  });

  assert.deepEqual(additions, [{ product: runningShoes, quantity: 2 }]);
  assert.deepEqual(result, {
    conversationId,
    message: "Added 2 × StrideFlow Daily Running Shoes to your cart.",
    products: [],
    cart: {
      id: "31000000-0000-4000-8000-000000000001",
      totalQuantity: 2,
      subtotalMinor: 799800,
      currency: "INR",
    },
  });
});

test("explains when authoritative cart rules reject an addition", async () => {
  const interpreter: IntentInterpreter = {
    async interpret() {
      return {
        action: "ADD_TO_CART",
        productName: "StrideFlow Daily Running Shoes",
        quantity: 10,
      };
    },
  };
  const catalog: CatalogModule = {
    async search() {
      return { products: [runningShoes] };
    },
    async getProduct() {
      throw new Error("Not used by this behavior");
    },
  };
  const cart: CartModule = {
    async addItem() {
      throw new CartError("The requested quantity is not in stock.");
    },
  };

  const agent = createLegacyCommerceAgent(
    catalog,
    interpreter,
    conversation,
    cart,
  );
  const result = await agent.respond({
    message: "add ten StrideFlow Daily Running Shoes to my cart",
  });

  assert.deepEqual(result, {
    conversationId,
    message: "I couldn't add that to your cart. The requested quantity is not in stock.",
    products: [],
  });
});
