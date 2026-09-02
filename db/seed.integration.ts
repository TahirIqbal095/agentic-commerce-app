import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test, { after } from "node:test";
import { promisify } from "node:util";
import { and, eq, gt } from "drizzle-orm";
import { GET } from "@/app/api/products/route";
import {
  DELETE as removeCartItem,
  GET as readCart,
  PATCH as updateCartItem,
  POST as addToCart,
} from "@/app/api/cart/route";
import { DELETE as deleteConversation } from "@/app/api/agent/conversation/route";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema/agent";
import { recommendationEvents } from "@/db/schema/analytics";
import { auditEvents } from "@/db/schema/audit";
import { cartItems, carts } from "@/db/schema/cart";
import { products } from "@/db/schema/catalog";
import { brands, guestSessions } from "@/db/schema/identity";
import { createCatalogModule } from "@/modules/catalog/catalog";
import { createCartModule, type CartView } from "@/modules/cart/cart";
import {
  cleanupExpiredGuestSessions,
  createDatabaseGuestSessionStore,
  createGuestSessionBrowsingRoute,
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

function cartAddRequest(
  productId: string,
  mutationKey: string,
  cookie?: string,
  expectedVersion = 0,
): Request {
  return new Request("http://localhost/api/cart", {
    method: "POST",
    headers: {
      ...(cookie ? { cookie } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      type: "ADD_PRODUCT",
      productId,
      mutationKey,
      expectedVersion,
    }),
  });
}
async function currentCartFor(cookie: string): Promise<CartView> {
  const response = await readCart(
    new Request("http://localhost/api/cart", { headers: { cookie } }),
  );
  assert.equal(response.status, 200);
  return ((await response.json()) as { data: CartView }).data;
}

function cartItemRequest(
  type: "INCREMENT_ITEM" | "DECREMENT_ITEM" | "REMOVE_ITEM",
  productId: string,
  mutationKey: string,
  cookie: string,
  expectedVersion: number,
): Request {
  return new Request("http://localhost/api/cart", {
    method: type === "REMOVE_ITEM" ? "DELETE" : "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ type, productId, mutationKey, expectedVersion }),
  });
}

async function seededProducts(count: number) {
  const rows = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(and(eq(products.active, true), gt(products.stock, 4)))
    .orderBy(products.slug)
    .limit(count);
  assert.equal(rows.length, count);
  return rows;
}

async function startCartWith(productId: string) {
  const response = await addToCart(cartAddRequest(productId, crypto.randomUUID()));
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie);
  const payload = (await response.json()) as { data: CartView };
  return { cookie, cart: payload.data };
}

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

test("meaningful browsing renews an existing Guest Session for 30 days", async () => {
  await runSeedCommand();
  await db.delete(guestSessions);
  const createRoute = createGuestSessionRoute(
    async () => new Response(null, { status: 204 }),
    {
      store: createDatabaseGuestSessionStore(db),
      now: () => new Date("2026-08-15T00:00:00.000Z"),
      issueToken: () => "browsing-session-token",
    },
  );
  const creationResponse = await createRoute(
    new Request("https://storefront.example/api/stateful", { method: "POST" }),
  );
  const cookie = creationResponse.headers.get("set-cookie")!.split(";", 1)[0];
  const browsingRoute = createGuestSessionBrowsingRoute(
    async () => new Response(null, { status: 204 }),
    {
      store: createDatabaseGuestSessionStore(db),
      now: () => new Date("2026-09-01T00:00:00.000Z"),
    },
  );

  const response = await browsingRoute(
    new Request("https://storefront.example/api/products", {
      headers: { cookie },
    }),
  );
  const [storedSession] = await db.select().from(guestSessions);

  assert.equal(response.status, 204);
  assert.match(response.headers.get("set-cookie") ?? "", /^guest_session=/);
  assert.equal(
    storedSession.expiresAt.toISOString(),
    "2026-10-01T00:00:00.000Z",
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

test("cleanup removes an expired Guest Session's Cart, Conversation, and Recommendation analytics", async () => {
  await runSeedCommand();
  await db.delete(guestSessions);
  const expiredGuestSessionId = "13000000-0000-4000-8000-000000000002";
  const activeGuestSessionId = "13000000-0000-4000-8000-000000000003";
  const expiredCartId = "31000000-0000-4000-8000-000000000002";
  const activeCartId = "31000000-0000-4000-8000-000000000003";
  const expiredConversationId = "41000000-0000-4000-8000-000000000002";
  const activeConversationId = "41000000-0000-4000-8000-000000000003";
  await db.insert(guestSessions).values([
    {
      id: expiredGuestSessionId,
      tokenHash: "a".repeat(64),
      expiresAt: new Date("2026-09-01T00:00:00.000Z"),
    },
    {
      id: activeGuestSessionId,
      tokenHash: "b".repeat(64),
      expiresAt: new Date("2026-09-01T00:00:00.001Z"),
    },
  ]);
  await db.insert(carts).values([
    {
      id: expiredCartId,
      guestSessionId: expiredGuestSessionId,
      currency: "INR" as const,
    },
    {
      id: activeCartId,
      guestSessionId: activeGuestSessionId,
      currency: "INR" as const,
    },
  ]);
  await db.insert(conversations).values([
    {
      id: expiredConversationId,
      guestSessionId: expiredGuestSessionId,
    },
    {
      id: activeConversationId,
      guestSessionId: activeGuestSessionId,
    },
  ]);
  await db.insert(messages).values([
    {
      conversationId: expiredConversationId,
      role: "CUSTOMER",
      content: "expired Conversation content",
    },
    {
      conversationId: activeConversationId,
      role: "CUSTOMER",
      content: "active Conversation content",
    },
  ]);
  await db.insert(recommendationEvents).values([
    {
      guestSessionId: expiredGuestSessionId,
      cartId: expiredCartId,
      sourceProductId: null,
      recommendedProductId: "21000000-0000-4000-8000-000000000001",
      recommendationType: "CROSS_SELL" as const,
      cartValueBeforeMinor: 399900,
      projectedCartValueMinor: 469800,
      incrementalRevenueMinor: 69900,
      shownAt: new Date("2026-08-01T00:00:00.000Z"),
      acceptedAt: null,
      rejectedAt: null,
    },
    {
      guestSessionId: activeGuestSessionId,
      cartId: activeCartId,
      sourceProductId: null,
      recommendedProductId: "21000000-0000-4000-8000-000000000001",
      recommendationType: "CROSS_SELL" as const,
      cartValueBeforeMinor: 399900,
      projectedCartValueMinor: 469800,
      incrementalRevenueMinor: 69900,
      shownAt: new Date("2026-08-01T00:00:00.000Z"),
      acceptedAt: null,
      rejectedAt: null,
    },
  ]);

  const result = await cleanupExpiredGuestSessions(
    db,
    new Date("2026-09-01T00:00:00.000Z"),
  );

  assert.deepEqual(result, { deletedGuestSessions: 1 });
  assert.deepEqual(
    await db.select({ id: guestSessions.id }).from(guestSessions),
    [{ id: activeGuestSessionId }],
  );
  assert.deepEqual(await db.select({ id: carts.id }).from(carts), [
    { id: activeCartId },
  ]);
  assert.deepEqual(
    await db.select({ id: conversations.id }).from(conversations),
    [{ id: activeConversationId }],
  );
  assert.deepEqual(
    await db.select({ content: messages.content }).from(messages),
    [{ content: "active Conversation content" }],
  );
  assert.equal(
    (await db.select().from(recommendationEvents)).length,
    1,
  );
});

test("cleanup can be retried after expired Guest Sessions are removed", async () => {
  await db.delete(guestSessions);
  await db.insert(guestSessions).values({
    id: "13000000-0000-4000-8000-000000000004",
    tokenHash: "c".repeat(64),
    expiresAt: new Date("2026-09-01T00:00:00.000Z"),
  });
  const cleanupTime = new Date("2026-09-01T00:00:00.000Z");

  const firstResult = await cleanupExpiredGuestSessions(db, cleanupTime);
  const retryResult = await cleanupExpiredGuestSessions(db, cleanupTime);

  assert.deepEqual(firstResult, { deletedGuestSessions: 1 });
  assert.deepEqual(retryResult, { deletedGuestSessions: 0 });
  assert.deepEqual(await db.select().from(guestSessions), []);
});

test("cleanup preserves an immutable Audit Event without retaining its expired Guest Session", async () => {
  const expiredGuestSessionId = "13000000-0000-4000-8000-000000000005";
  const auditEventId = "61000000-0000-4000-8000-000000000001";
  await db.delete(auditEvents).where(eq(auditEvents.id, auditEventId));
  await db.delete(guestSessions);
  await db.insert(guestSessions).values({
    id: expiredGuestSessionId,
    tokenHash: "d".repeat(64),
    expiresAt: new Date("2026-09-01T00:00:00.000Z"),
  });
  await db.insert(auditEvents).values({
    id: auditEventId,
    guestSessionId: expiredGuestSessionId,
    entityType: "Guest Session",
    entityId: expiredGuestSessionId,
    actorType: "SYSTEM",
    eventType: "GUEST_SESSION_ACTIVITY_RECORDED",
    message: "Protected historical fact",
  });

  const result = await cleanupExpiredGuestSessions(
    db,
    new Date("2026-09-01T00:00:00.000Z"),
  );

  assert.deepEqual(result, { deletedGuestSessions: 1 });
  assert.deepEqual(await db.select().from(guestSessions), []);
  assert.deepEqual(
    await db
      .select({ id: auditEvents.id, guestSessionId: auditEvents.guestSessionId })
      .from(auditEvents)
      .where(eq(auditEvents.id, auditEventId)),
    [{ id: auditEventId, guestSessionId: expiredGuestSessionId }],
  );
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

test("database exposes no authenticated Customer or Brand Admin identity contract", async () => {
  const tables = await db.$client.query<{ table_name: string }>(
    `select table_name
       from information_schema.tables
      where table_schema = 'public'
        and table_name = any($1::text[])
      order by table_name`,
    [["brand_admins", "users"]],
  );
  const identityColumns = await db.$client.query<{
    column_name: string;
    table_name: string;
  }>(
    `select table_name, column_name
       from information_schema.columns
      where table_schema = 'public'
        and column_name = any($1::text[])
      order by table_name, column_name`,
    [["admin_id", "customer_id", "user_id"]],
  );
  const actorTypes = await db.$client.query<{ enumlabel: string }>(
    `select enumlabel
       from pg_enum
       join pg_type on pg_type.oid = pg_enum.enumtypid
      where pg_type.typname = 'actor_type'
      order by enumsortorder`,
  );
  const messageRoles = await db.$client.query<{ enumlabel: string }>(
    `select enumlabel
       from pg_enum
       join pg_type on pg_type.oid = pg_enum.enumtypid
      where pg_type.typname = 'message_role'
      order by enumsortorder`,
  );

  assert.deepEqual(
    {
      tables: tables.rows,
      identityColumns: identityColumns.rows,
      actorTypes: actorTypes.rows.map(({ enumlabel }) => enumlabel),
      messageRoles: messageRoles.rows.map(({ enumlabel }) => enumlabel),
    },
    {
      tables: [],
      identityColumns: [],
      actorTypes: ["AGENT", "SYSTEM", "RAZORPAY"],
      messageRoles: ["CUSTOMER", "ASSISTANT", "TOOL", "SYSTEM"],
    },
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
    cart.addItem(product, 1, async () => {}, {
      mutationKey: "61000000-0000-4000-8000-000000000101",
      expectedVersion: 0,
    }),
    cart.addItem(product, 1, async () => {}, {
      mutationKey: "61000000-0000-4000-8000-000000000102",
      expectedVersion: 0,
    }),
  ]);
  const summary = await cart.inspect();

  assert.equal(summary.totalQuantity, 2);
  assert.equal(summary.subtotalMinor, 799800);
  assert.equal(summary.currency, "INR");
});

test("repeated explicit Add commands increment one Cart Item without repricing it", async () => {
  await runSeedCommand();
  const catalog = createCatalogModule();
  const result = await catalog.search({
    query: "StrideFlow Daily Running Shoes",
    limit: 1,
  });
  const product = result.products[0];
  assert.ok(product);

  const firstResponse = await addToCart(
    cartAddRequest(product.id, crypto.randomUUID()),
  );
  const cookie = firstResponse.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie);
  const secondResponse = await addToCart(
    cartAddRequest(product.id, crypto.randomUUID(), cookie, 2),
  );

  assert.equal(firstResponse.status, 200);
  assert.equal(secondResponse.status, 200);
  const payload = (await secondResponse.json()) as {
    data: CartView;
  };
  assert.deepEqual(payload.data.items, [
    {
      productId: product.id,
      productName: product.name,
      quantity: 2,
      cartPriceMinor: product.priceMinor,
      subtotalMinor: product.priceMinor * 2,
    },
  ]);
  assert.equal(payload.data.totalQuantity, 2);
});

test("explicit Add rejects a lower inventory limit with the unchanged Cart", async () => {
  await runSeedCommand();
  const [product] = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(eq(products.active, true))
    .limit(1);
  assert.ok(product);
  await db
    .update(products)
    .set({ stock: 1 })
    .where(eq(products.id, product.id));

  const firstResponse = await addToCart(
    cartAddRequest(product.id, crypto.randomUUID()),
  );
  const cookie = firstResponse.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie);
  const rejectedResponse = await addToCart(
    cartAddRequest(product.id, crypto.randomUUID(), cookie, 2),
  );

  assert.equal(rejectedResponse.status, 409);
  const payload = (await rejectedResponse.json()) as {
    error: { message: string; details: { cart: CartView } };
  };
  assert.equal(
    payload.error.message,
    `${product.name} only has 1 unit in stock.`,
  );
  assert.equal(payload.error.details.cart.totalQuantity, 1);
  assert.equal(payload.error.details.cart.items[0]?.quantity, 1);
});

test("explicit Add rejects inactive and out-of-stock Products without creating a Cart", async () => {
  await runSeedCommand();
  const availableProducts = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.active, true))
    .limit(2);
  const inactiveProduct = availableProducts[0];
  const outOfStockProduct = availableProducts[1];
  assert.ok(inactiveProduct);
  assert.ok(outOfStockProduct);
  await db
    .update(products)
    .set({ active: false })
    .where(eq(products.id, inactiveProduct.id));
  await db
    .update(products)
    .set({ stock: 0 })
    .where(eq(products.id, outOfStockProduct.id));

  const inactiveResponse = await addToCart(
    cartAddRequest(inactiveProduct.id, crypto.randomUUID()),
  );
  const outOfStockResponse = await addToCart(
    cartAddRequest(outOfStockProduct.id, crypto.randomUUID()),
  );

  assert.equal(inactiveResponse.status, 409);
  assert.deepEqual(await inactiveResponse.json(), {
    error: {
      code: "PRODUCT_UNAVAILABLE",
      message: "The Product is not available.",
      details: {
        cart: {
          id: null,
          version: 0,
          items: [],
          totalQuantity: 0,
          subtotalMinor: 0,
          currency: "INR",
        },
      },
    },
  });
  assert.equal(outOfStockResponse.status, 409);
  const outOfStockPayload = (await outOfStockResponse.json()) as {
    error: { message: string; details: { cart: CartView } };
  };
  assert.match(outOfStockPayload.error.message, /only has 0 units in stock/);
  assert.equal(outOfStockPayload.error.details.cart.id, null);
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

test("a repeated Add command applies once and returns its original Cart", async () => {
  await runSeedCommand();
  const [product] = await seededProducts(1);
  const mutationKey = crypto.randomUUID();

  const first = await addToCart(cartAddRequest(product.id, mutationKey));
  const cookie = first.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie);
  const replay = await addToCart(
    cartAddRequest(product.id, mutationKey, cookie, 0),
  );

  assert.equal(first.status, 200);
  assert.equal(replay.status, 200);
  const firstPayload = (await first.json()) as { data: CartView };
  const replayPayload = (await replay.json()) as { data: CartView };
  assert.deepEqual(replayPayload.data, firstPayload.data);
  assert.equal(replayPayload.data.totalQuantity, 1);
  const [storedItem] = await db
    .select({ quantity: cartItems.quantity })
    .from(cartItems)
    .where(
      and(
        eq(cartItems.cartId, firstPayload.data.id!),
        eq(cartItems.productId, product.id),
      ),
    );
  assert.equal(storedItem.quantity, 1);
});

test("a repeated quantity change applies once and returns its original Cart", async () => {
  await runSeedCommand();
  const [product] = await seededProducts(1);
  const { cookie, cart } = await startCartWith(product.id);
  const mutationKey = crypto.randomUUID();

  const first = await updateCartItem(
    cartItemRequest("INCREMENT_ITEM", product.id, mutationKey, cookie, cart.version),
  );
  const replay = await updateCartItem(
    cartItemRequest("INCREMENT_ITEM", product.id, mutationKey, cookie, cart.version),
  );

  assert.equal(first.status, 200);
  assert.equal(replay.status, 200);
  const firstPayload = (await first.json()) as { data: CartView };
  const replayPayload = (await replay.json()) as { data: CartView };
  assert.equal(firstPayload.data.totalQuantity, 2);
  assert.deepEqual(replayPayload.data, firstPayload.data);
  const [storedItem] = await db
    .select({ quantity: cartItems.quantity })
    .from(cartItems)
    .where(
      and(
        eq(cartItems.cartId, firstPayload.data.id!),
        eq(cartItems.productId, product.id),
      ),
    );
  assert.equal(storedItem.quantity, 2);
});

test("a repeated removal applies once and returns its original Cart", async () => {
  await runSeedCommand();
  const [product] = await seededProducts(1);
  const { cookie, cart } = await startCartWith(product.id);
  const mutationKey = crypto.randomUUID();

  const first = await removeCartItem(
    cartItemRequest("REMOVE_ITEM", product.id, mutationKey, cookie, cart.version),
  );
  const replay = await removeCartItem(
    cartItemRequest("REMOVE_ITEM", product.id, mutationKey, cookie, cart.version),
  );

  assert.equal(first.status, 200);
  assert.equal(replay.status, 200);
  const firstPayload = (await first.json()) as { data: CartView };
  const replayPayload = (await replay.json()) as { data: CartView };
  assert.deepEqual(firstPayload.data.items, []);
  assert.deepEqual(replayPayload.data, firstPayload.data);
});

test("distinct concurrent Cart commands are all retained", async () => {
  await runSeedCommand();
  const [first, second, third] = await seededProducts(3);
  const { cookie, cart } = await startCartWith(first.id);

  const responses = await Promise.all([
    addToCart(cartAddRequest(second.id, crypto.randomUUID(), cookie, cart.version)),
    addToCart(cartAddRequest(third.id, crypto.randomUUID(), cookie, cart.version)),
    updateCartItem(
      cartItemRequest(
        "INCREMENT_ITEM",
        first.id,
        crypto.randomUUID(),
        cookie,
        cart.version,
      ),
    ),
  ]);

  assert.deepEqual(
    responses.map((response) => response.status),
    [200, 200, 200],
  );
  const currentCart = await currentCartFor(cookie);
  assert.equal(currentCart.totalQuantity, 4);
  assert.deepEqual(
    [...currentCart.items].map((item) => item.productId).sort(),
    [first.id, second.id, third.id].sort(),
  );
  assert.equal(
    currentCart.items.find((item) => item.productId === first.id)?.quantity,
    2,
  );
});

test("every concurrent Cart command advances the authoritative Cart version once", async () => {
  await runSeedCommand();
  const [first, second] = await seededProducts(2);
  const { cookie, cart } = await startCartWith(first.id);

  await Promise.all([
    addToCart(cartAddRequest(second.id, crypto.randomUUID(), cookie, cart.version)),
    updateCartItem(
      cartItemRequest(
        "INCREMENT_ITEM",
        first.id,
        crypto.randomUUID(),
        cookie,
        cart.version,
      ),
    ),
  ]);

  const currentCart = await currentCartFor(cookie);
  assert.equal(currentCart.version, cart.version + 2);
});

test("a Cart command claiming an unknown version returns a typed conflict", async () => {
  await runSeedCommand();
  const [product] = await seededProducts(1);
  const { cookie, cart } = await startCartWith(product.id);

  const response = await updateCartItem(
    cartItemRequest(
      "INCREMENT_ITEM",
      product.id,
      crypto.randomUUID(),
      cookie,
      cart.version + 5,
    ),
  );

  assert.equal(response.status, 409);
  const payload = (await response.json()) as {
    error: { code: string; details: { cart: CartView } };
  };
  assert.equal(payload.error.code, "CART_CONFLICT");
  assert.equal(payload.error.details.cart.version, cart.version);
  assert.equal(payload.error.details.cart.totalQuantity, 1);
});

test("reusing one mutation key for another Cart command returns a typed conflict", async () => {
  await runSeedCommand();
  const [product] = await seededProducts(1);
  const { cookie, cart } = await startCartWith(product.id);
  const mutationKey = crypto.randomUUID();

  const increment = await updateCartItem(
    cartItemRequest("INCREMENT_ITEM", product.id, mutationKey, cookie, cart.version),
  );
  const reused = await removeCartItem(
    cartItemRequest("REMOVE_ITEM", product.id, mutationKey, cookie, cart.version),
  );

  assert.equal(increment.status, 200);
  assert.equal(reused.status, 409);
  const payload = (await reused.json()) as {
    error: { code: string; message: string; details: { cart: CartView } };
  };
  assert.equal(payload.error.code, "CART_CONFLICT");
  assert.equal(
    payload.error.message,
    "The mutation key was already used for another Cart command.",
  );
  assert.equal(payload.error.details.cart.totalQuantity, 2);
});

test("a command for a Cart Item another tab removed recovers the authoritative Cart", async () => {
  await runSeedCommand();
  const [product] = await seededProducts(1);
  const { cookie, cart } = await startCartWith(product.id);

  const removal = await removeCartItem(
    cartItemRequest("REMOVE_ITEM", product.id, crypto.randomUUID(), cookie, cart.version),
  );
  const staleIncrement = await updateCartItem(
    cartItemRequest(
      "INCREMENT_ITEM",
      product.id,
      crypto.randomUUID(),
      cookie,
      cart.version,
    ),
  );

  assert.equal(removal.status, 200);
  assert.equal(staleIncrement.status, 409);
  const payload = (await staleIncrement.json()) as {
    error: { code: string; message: string; details: { cart: CartView } };
  };
  assert.equal(payload.error.code, "CART_CONFLICT");
  assert.equal(payload.error.message, "The Cart Item is no longer in the Cart.");
  assert.deepEqual(payload.error.details.cart.items, []);
  assert.equal(payload.error.details.cart.totalQuantity, 0);
});

test("a Cart command retried after a lost response applies exactly once", async () => {
  await runSeedCommand();
  const [product] = await seededProducts(1);
  const { cookie, cart } = await startCartWith(product.id);
  const mutationKey = crypto.randomUUID();

  const lost = await updateCartItem(
    cartItemRequest("INCREMENT_ITEM", product.id, mutationKey, cookie, cart.version),
  );
  const appliedCart = ((await lost.json()) as { data: CartView }).data;
  const retry = await updateCartItem(
    cartItemRequest("INCREMENT_ITEM", product.id, mutationKey, cookie, cart.version),
  );

  assert.equal(retry.status, 200);
  const retryPayload = (await retry.json()) as { data: CartView };
  assert.deepEqual(retryPayload.data, appliedCart);
  const currentCart = await currentCartFor(cookie);
  assert.equal(currentCart.totalQuantity, 2);
  assert.equal(currentCart.version, appliedCart.version);
});
