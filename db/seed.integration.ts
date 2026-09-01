import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test, { after } from "node:test";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { GET } from "@/app/api/products/route";
import { DELETE as deleteConversation } from "@/app/api/agent/conversation/route";
import { db } from "@/db";
import { cartItems, carts } from "@/db/schema/cart";
import { products } from "@/db/schema/catalog";
import { brands, guestSessions } from "@/db/schema/identity";
import { createCatalogModule } from "@/modules/catalog/catalog";
import { createCartModule } from "@/modules/cart/cart";
import {
  createDatabaseGuestSessionStore,
  createGuestSessionRoute,
} from "@/modules/identity/guest-session";

const execFileAsync = promisify(execFile);
const TEST_GUEST_SESSION_ID = "13000000-0000-4000-8000-000000000001";
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
  await db
    .insert(guestSessions)
    .values({
      id: TEST_GUEST_SESSION_ID,
      tokenHash:
        "833e5ef61f9ac3d83d4a3e0b2f17cff970507494cc6be1131bb47f221d08521a",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    })
    .onConflictDoUpdate({
      target: guestSessions.id,
      set: { expiresAt: new Date("2099-01-01T00:00:00.000Z") },
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

test("database rejects a Brand configured outside INR", async () => {
  await runSeedCommand();
  await db.delete(brands);

  await assert.rejects(
    db.insert(brands).values({
      name: "Unsupported Currency Brand",
      slug: "unsupported-currency-brand",
      description: "A Brand whose currency must be rejected.",
      currency: "USD",
    }),
  );

  await runSeedCommand();
});

test("Guest Sessions persist a token hash instead of the cookie token", async () => {
  await db.delete(guestSessions);
  const route = createGuestSessionRoute(
    async () => new Response(null, { status: 204 }),
    {
      store: createDatabaseGuestSessionStore(db),
      now: () => new Date("2026-09-01T00:00:00.000Z"),
      issueToken: () => "database-guest-session-token",
    },
  );

  const response = await route(
    new Request("https://storefront.example/api/stateful", {
      method: "POST",
    }),
  );
  const [storedSession] = await db.select().from(guestSessions);

  assert.equal(response.status, 204);
  assert.ok(storedSession);
  assert.equal(
    storedSession.tokenHash,
    "9258ab01a459823c10aa99916dcd338d1fcd7a67c4802f927263b88bcc3d99bd",
  );
  assert.equal("token" in storedSession, false);
  assert.equal(
    storedSession.expiresAt.toISOString(),
    "2026-10-01T00:00:00.000Z",
  );
});

test("passive Storefront browsing creates no Guest Session", async () => {
  await runSeedCommand();
  await db.delete(guestSessions);

  const response = await getProducts();
  const storedSessions = await db.select().from(guestSessions);

  assert.equal(response.status, 200);
  assert.equal(response.headers.has("set-cookie"), false);
  assert.deepEqual(storedSessions, []);
});

test("passive browsing refreshes an existing Guest Session", async () => {
  await runSeedCommand();
  await db.delete(guestSessions);
  const initialExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const createRoute = createGuestSessionRoute(
    async () => new Response(null, { status: 204 }),
    {
      store: createDatabaseGuestSessionStore(db),
      issueToken: () => "browsing-session-token",
    },
  );
  const creationResponse = await createRoute(
    new Request("https://storefront.example/api/stateful", { method: "POST" }),
  );
  await db.update(guestSessions).set({ expiresAt: initialExpiry });
  const cookie = creationResponse.headers.get("set-cookie")!.split(";", 1)[0];

  const response = await GET(
    new Request("https://storefront.example/api/products?limit=50", {
      headers: { cookie },
    }),
  );
  const [storedSession] = await db.select().from(guestSessions);

  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie") ?? "", /^guest_session=/);
  assert.ok(
    storedSession.expiresAt.getTime() >
      initialExpiry.getTime() + 28 * 24 * 60 * 60 * 1000,
  );
});

test("a state-changing Storefront route creates a Guest Session", async () => {
  await runSeedCommand();
  await db.delete(guestSessions);

  const response = await deleteConversation(
    new Request("https://storefront.example/api/agent/conversation", {
      method: "DELETE",
    }),
  );
  const storedSessions = await db.select().from(guestSessions);

  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie") ?? "", /^guest_session=/);
  assert.equal(storedSessions.length, 1);
});

test("database rejects a Product priced outside INR", async () => {
  await runSeedCommand();

  await assert.rejects(
    db.insert(products).values({
      name: "Unsupported Currency Product",
      slug: "unsupported-currency-product",
      description: "A Product whose currency must be rejected.",
      category: "Footwear",
      priceMinor: 10000,
      currency: "USD",
      stock: 1,
    }),
  );
});

test("database rejects a Cart amount outside INR", async () => {
  await runSeedCommand();
  await db.delete(carts).where(eq(carts.guestSessionId, TEST_GUEST_SESSION_ID));

  await assert.rejects(
    db.insert(carts).values({
      guestSessionId: TEST_GUEST_SESSION_ID,
      currency: "USD",
    }),
  );
});

test("Cart inspection rejects a non-INR runtime default", async () => {
  await runSeedCommand();
  await db.delete(carts).where(eq(carts.guestSessionId, TEST_GUEST_SESSION_ID));

  assert.throws(() => createCartModule(TEST_GUEST_SESSION_ID, "USD"), {
    name: "CartError",
    message: "Cart currency must be INR.",
  });
});

test("database rejects runtime Product price changes", async () => {
  await runSeedCommand();
  const [product] = await db
    .select({ id: products.id, priceMinor: products.priceMinor })
    .from(products)
    .limit(1);
  assert.ok(product);

  await assert.rejects(
    db
      .update(products)
      .set({ priceMinor: product.priceMinor + 1 })
      .where(eq(products.id, product.id)),
  );
});

test("database contains no deferred checkout or payment storage", async () => {
  const deferredTables = [
    "approvals",
    "checkout_proposal_items",
    "checkout_proposals",
    "order_items",
    "orders",
    "payment_attempts",
    "policies",
    "policy_evaluations",
    "webhook_events",
  ];
  const result = await db.$client.query<{ table_name: string }>(
    `select table_name
       from information_schema.tables
      where table_schema = 'public'
        and table_name = any($1::text[])
      order by table_name`,
    [deferredTables],
  );
  const deferredTypes = [
    "approval_status",
    "checkout_proposal_status",
    "order_status",
    "payment_provider",
    "payment_status",
    "policy_decision",
  ];
  const typeResult = await db.$client.query<{ typname: string }>(
    `select typname
       from pg_type
      where typname = any($1::text[])
      order by typname`,
    [deferredTypes],
  );

  assert.deepEqual(result.rows, []);
  assert.deepEqual(typeResult.rows, []);
});

test("recommendation analytics are pseudonymous and expose no personal-information fields", async () => {
  const result = await db.$client.query<{ column_name: string }>(
    `select column_name
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'recommendation_events'
      order by column_name`,
  );
  const columns = result.rows.map(({ column_name }) => column_name);

  assert.ok(columns.includes("guest_session_id"));
  assert.equal(columns.includes("user_id"), false);
  assert.equal(columns.includes("reason"), false);
  assert.equal(columns.includes("email"), false);
  assert.equal(columns.includes("name"), false);
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
  await db.delete(carts).where(eq(carts.guestSessionId, TEST_GUEST_SESSION_ID));

  const catalog = createCatalogModule();
  const result = await catalog.search({
    query: "StrideFlow Daily Running Shoes",
    limit: 1,
  });
  const product = result.products[0];
  assert.ok(product);

  const cart = createCartModule(TEST_GUEST_SESSION_ID);
  await Promise.all([
    cart.addItem(product, 1, async () => {}),
    cart.addItem(product, 1, async () => {}),
  ]);
  const summary = await cart.inspect();

  assert.equal(summary.totalQuantity, 2);
  assert.equal(summary.subtotalMinor, 799800);
  assert.equal(summary.currency, "INR");
});

test("Cart additions retain an existing Cart Price", async () => {
  await runSeedCommand();
  await db.delete(carts).where(eq(carts.guestSessionId, TEST_GUEST_SESSION_ID));
  const catalog = createCatalogModule();
  const result = await catalog.search({
    query: "StrideFlow Daily Running Shoes",
    limit: 1,
  });
  const product = result.products[0];
  assert.ok(product);

  const [activeCart] = await db
    .insert(carts)
    .values({ guestSessionId: TEST_GUEST_SESSION_ID, currency: "INR" })
    .returning({ id: carts.id });
  await db.insert(cartItems).values({
    cartId: activeCart.id,
    productId: product.id,
    quantity: 2,
    unitPriceSnapshotMinor: 389900,
  });

  const cart = createCartModule(TEST_GUEST_SESSION_ID);
  const updated = await cart.addItem(product, 1, async () => {});

  assert.equal(updated.items[0].quantity, 3);
  assert.equal(updated.items[0].cartPriceMinor, 389900);
  assert.equal(updated.items[0].subtotalMinor, 1169700);
  assert.equal("priceChange" in updated, false);
});

test("database rejects runtime Cart Price changes", async () => {
  await runSeedCommand();
  await db.delete(carts).where(eq(carts.guestSessionId, TEST_GUEST_SESSION_ID));
  const [product] = await db
    .select({ id: products.id, priceMinor: products.priceMinor })
    .from(products)
    .limit(1);
  assert.ok(product);
  const [activeCart] = await db
    .insert(carts)
    .values({ guestSessionId: TEST_GUEST_SESSION_ID, currency: "INR" })
    .returning({ id: carts.id });
  await db.insert(cartItems).values({
    cartId: activeCart.id,
    productId: product.id,
    quantity: 1,
    unitPriceSnapshotMinor: product.priceMinor,
  });

  await assert.rejects(
    db
      .update(cartItems)
      .set({ unitPriceSnapshotMinor: product.priceMinor + 1 })
      .where(eq(cartItems.cartId, activeCart.id)),
  );
});
