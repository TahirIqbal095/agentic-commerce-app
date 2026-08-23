import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test, { after } from "node:test";
import { promisify } from "node:util";
import { GET } from "@/app/api/products/route";
import { db } from "@/db";

const execFileAsync = promisify(execFile);
const DEMO_MERCHANT_ID = "11111111-1111-4111-8111-111111111111";
const EXPECTED_ACTIVE_PRODUCTS = [
  { slug: "aerotune-wireless-headphones", inStock: true },
  { slug: "pocket-bluetooth-speaker", inStock: false },
  { slug: "sprint-running-shoes", inStock: true },
  { slug: "commuter-backpack", inStock: true },
  { slug: "pulse-smart-watch", inStock: true },
  { slug: "compact-coffee-maker", inStock: true },
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
});
