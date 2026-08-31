import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test, { after } from "node:test";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { GET } from "@/app/api/products/route";
import { db } from "@/db";
import { carts } from "@/db/schema/cart";
import { products } from "@/db/schema/catalog";
import { brands } from "@/db/schema/identity";
import { createCatalogModule } from "@/modules/catalog/catalog";
import { createCartModule } from "@/modules/cart/cart";
import { DEMO_CUSTOMER_ID } from "@/db/seed";

const execFileAsync = promisify(execFile);
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
after(async () => {
  await db.$client.end();
});

async function runSeedCommand(): Promise<void> {
  await execFileAsync("pnpm", ["db:seed"], {
    cwd: process.cwd(),
    env: process.env,
  });
}

async function getProducts(): Promise<Response> {
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
    audience: "Unisex",
    colors: ["Midnight Blue", "Cloud White"],
    sizes: ["UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11"],
    useCases: ["road running", "daily training"],
    surface: "Road",
    cushioning: "Responsive",
    support: "Neutral",
  });
});

test("storefront fails when its required Brand is not configured", async () => {
  await runSeedCommand();
  await db.delete(brands);

  const response = await getProducts();

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
      details: {},
    },
  });

  await runSeedCommand();
});

test("database rejects a second Brand in one deployment", async () => {
  await runSeedCommand();

  await assert.rejects(
    db.insert(brands).values({
      name: "Another Brand",
      slug: "another-brand",
      description: "A Brand that must use a separate deployment.",
      currency: "INR",
    }),
  );
});

test("catalog search matches related footwear product types", async () => {
  await runSeedCommand();
  const catalog = createCatalogModule();

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
  const catalog = createCatalogModule();

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

test("concurrent Customer turns retain every authoritative Cart addition", async () => {
  await runSeedCommand();
  await db.delete(carts).where(eq(carts.userId, DEMO_CUSTOMER_ID));

  const catalog = createCatalogModule();
  const result = await catalog.search({
    query: "StrideFlow Daily Running Shoes",
    limit: 1,
  });
  const product = result.products[0];
  assert.ok(product);
  const [stockBeforeAddition] = await db
    .select({ stock: products.stock })
    .from(products)
    .where(eq(products.id, product.id));

  const cart = createCartModule(DEMO_CUSTOMER_ID);
  await Promise.all([
    cart.addItem(product, 1, async () => {}),
    cart.addItem(product, 1, async () => {}),
  ]);
  const summary = await cart.inspect();

  assert.equal(summary.totalQuantity, 2);
  assert.equal(summary.subtotalMinor, 799800);
  assert.equal(summary.currency, "INR");
  const [stockAfterAddition] = await db
    .select({ stock: products.stock })
    .from(products)
    .where(eq(products.id, product.id));
  assert.equal(stockAfterAddition.stock, stockBeforeAddition.stock);

  await db
    .update(products)
    .set({ priceMinor: 429900 })
    .where(eq(products.id, product.id));
  const inspected = await cart.inspect();

  assert.equal(inspected.items[0].cartPriceMinor, 399900);
  assert.equal(inspected.items[0].subtotalMinor, 799800);
  assert.equal(inspected.subtotalMinor, 799800);
  assert.deepEqual(inspected.items[0].priceComparison, {
    currentBasePriceMinor: 429900,
    direction: "INCREASED",
  });

  const repriced = await cart.addItem(product, 1, async () => {});

  assert.equal(repriced.items[0].quantity, 3);
  assert.equal(repriced.items[0].cartPriceMinor, 429900);
  assert.equal(repriced.items[0].subtotalMinor, 1289700);
  assert.deepEqual(repriced.priceChange, {
    productId: product.id,
    previousCartPriceMinor: 399900,
    currentCartPriceMinor: 429900,
  });

  await db
    .update(products)
    .set({ stock: 2 })
    .where(eq(products.id, product.id));
  const insufficientStock = await cart.inspect();

  assert.deepEqual(insufficientStock.items[0].availabilityWarning, {
    reason: "INSUFFICIENT_STOCK",
    availableQuantity: 2,
  });
  assert.equal(insufficientStock.items[0].quantity, 3);

  await db
    .update(products)
    .set({ active: false })
    .where(eq(products.id, product.id));
  const inactive = await cart.inspect();

  assert.deepEqual(inactive.items[0].availabilityWarning, {
    reason: "INACTIVE",
  });
  assert.equal(inactive.items[0].quantity, 3);
});
