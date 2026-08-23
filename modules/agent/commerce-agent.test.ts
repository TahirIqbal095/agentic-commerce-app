import assert from "node:assert/strict";
import test from "node:test";
import type {
  CatalogModule,
  CatalogProduct,
  CatalogSearch,
} from "@/modules/catalog/catalog";
import { createCommerceAgent } from "./commerce-agent";

const headphones: CatalogProduct = {
  id: "20000000-0000-4000-8000-000000000001",
  slug: "aerotune-wireless-headphones",
  name: "AeroTune Wireless Headphones",
  description: "Over-ear wireless headphones with active noise cancellation.",
  category: "Audio",
  priceMinor: 449900,
  currency: "INR",
  inStock: true,
  attributes: { wireless: true },
};

test("shows authoritative catalog products when the user asks to see products", async () => {
  const searches: CatalogSearch[] = [];
  const catalog: CatalogModule = {
    async search(input) {
      searches.push(input);
      return { products: [headphones] };
    },
    async getProduct() {
      throw new Error("Not used by this behavior");
    },
  };

  const agent = createCommerceAgent(catalog);
  const result = await agent.respond({ message: "show me products" });

  assert.deepEqual(searches, [{ limit: 20 }]);
  assert.deepEqual(result, {
    message: "Here are the products currently available in our catalog.",
    products: [headphones],
  });
});

test("explains when the merchant has no active products", async () => {
  const catalog: CatalogModule = {
    async search() {
      return { products: [] };
    },
    async getProduct() {
      throw new Error("Not used by this behavior");
    },
  };

  const agent = createCommerceAgent(catalog);
  const result = await agent.respond({ message: "show me products" });

  assert.deepEqual(result, {
    message: "There are no products available right now.",
    products: [],
  });
});
