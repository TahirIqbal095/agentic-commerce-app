import assert from "node:assert/strict";
import test from "node:test";
import type {
  CatalogModule,
  CatalogProduct,
  CatalogSearch,
} from "@/modules/catalog/catalog";
import {
  createCommerceAgent,
  type IntentInterpreter,
} from "./commerce-agent";

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

  const agent = createCommerceAgent(catalog, interpreter);
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

  const agent = createCommerceAgent(catalog, interpreter);
  const result = await agent.respond({ message: "show me products" });

  assert.deepEqual(result, {
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
