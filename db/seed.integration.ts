import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test, { after } from "node:test";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { GET } from "@/app/api/products/route";
import { db } from "@/db";
import { carts } from "@/db/schema/cart";
import { createCatalogModule } from "@/modules/catalog/catalog";
import { createCartModule } from "@/modules/cart/cart";
import { DEMO_CUSTOMER_ID } from "@/db/seed";

const execFileAsync = promisify(execFile);
const DEMO_MERCHANT_ID = "11111111-1111-4111-8111-111111111111";
const EXPECTED_ACTIVE_PRODUCTS = [
  { slug: "strideflow-daily-running-shoes", inStock: true },
  { slug: "trailcrest-grip-running-shoes", inStock: true },
  { slug: "cloudstep-walking-shoes", inStock: false },
  { slug: "flexforge-training-shoes", inStock: true },
  { slug: "courtline-casual-sneakers", inStock: true },
  { slug: "heritage-oxford-formal-shoes", inStock: true },
  { slug: "everyday-comfort-sandals", inStock: true },
  { slug: "performance-ankle-socks", inStock: true },
  { slug: "cushioned-crew-socks", inStock: true },
  { slug: "support-gel-insoles", inStock: true },
  { slug: "reflective-running-laces", inStock: true },
  { slug: "complete-shoe-care-kit", inStock: true },
];
const originalMerchantId = process.env.MERCHANT_ID;

after(async () => {
  if (originalMerchantId === undefined) {
    delete process.env.MERCHANT_ID;
  } else {
    process.env.MERCHANT_ID = originalMerchantId;
  }
  await db.$client.end();
});

async function runSeedCommand(): Promise<void> {
  await execFileAsync("pnpm", ["db:seed"], {
    cwd: process.cwd(),
    env: process.env,
  });
}

async function getProducts(): Promise<Response> {
  process.env.MERCHANT_ID = DEMO_MERCHANT_ID;
  return GET(new Request("http://localhost/api/products?limit=50"));
}

test("demo catalog seed is repeatable and exposes only active products", async () => {
  await runSeedCommand();
  const firstResponse = await getProducts();
  const firstBody = await firstResponse.json();

  await runSeedCommand();
  const secondResponse = await getProducts();
  const secondBody = await secondResponse.json();

  assert.equal(firstResponse.status, 200);
  assert.equal(secondResponse.status, 200);
  assert.deepEqual(secondBody, firstBody);
  assert.deepEqual(
    secondBody.data.products.map(
      (product: { slug: string; inStock: boolean }) => ({
        slug: product.slug,
        inStock: product.inStock,
      }),
    ),
    EXPECTED_ACTIVE_PRODUCTS,
  );

  const roadRunningShoe = secondBody.data.products.find(
    (product: { slug: string }) =>
      product.slug === "strideflow-daily-running-shoes",
  );
  assert.deepEqual(roadRunningShoe?.attributes, {
    brand: "StrideFlow",
    audience: "Unisex",
    colors: ["Midnight Blue", "Cloud White"],
    sizes: ["UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11"],
    useCases: ["road running", "daily training"],
    surface: "Road",
    cushioning: "Responsive",
    support: "Neutral",
  });
});

test("catalog search matches related footwear product types", async () => {
  await runSeedCommand();
  const catalog = createCatalogModule(DEMO_MERCHANT_ID);

  const result = await catalog.search({
    queries: ["running shoes", "trainers", "sneakers"],
    category: "Footwear",
    limit: 20,
  });

  assert.deepEqual(
    result.products.map((product) => product.slug),
    [
      "strideflow-daily-running-shoes",
      "trailcrest-grip-running-shoes",
      "flexforge-training-shoes",
      "courtline-casual-sneakers",
    ],
  );
});

test("catalog retrieval combines intent, commerce, and availability criteria", async () => {
  await runSeedCommand();
  const catalog = createCatalogModule(DEMO_MERCHANT_ID);

  const result = await catalog.search({
    productTypes: ["running shoes"],
    useCases: ["road running"],
    features: ["breathable"],
    category: "Footwear",
    minPriceMinor: 200000,
    maxPriceMinor: 500000,
    size: "UK 9",
    inStockOnly: true,
    attributes: { support: "Neutral" },
    limit: 20,
  });

  assert.deepEqual(
    result.products.map((product) => product.slug),
    ["strideflow-daily-running-shoes"],
  );
});

test("customer can add a product to an authoritative active cart", async () => {
  await runSeedCommand();
  await db.delete(carts).where(eq(carts.userId, DEMO_CUSTOMER_ID));

  const catalog = createCatalogModule(DEMO_MERCHANT_ID);
  const result = await catalog.search({
    query: "StrideFlow Daily Running Shoes",
    limit: 1,
  });
  const product = result.products[0];
  assert.ok(product);

  const cart = createCartModule(DEMO_CUSTOMER_ID, DEMO_MERCHANT_ID);
  const summary = await cart.addItem(product, 2);

  assert.equal(summary.totalQuantity, 2);
  assert.equal(summary.subtotalMinor, 799800);
  assert.equal(summary.currency, "INR");
});
