import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test, { after } from "node:test";
import { promisify } from "node:util";
import { and, eq } from "drizzle-orm";
import { GET } from "@/app/api/products/route";
import { createPostHandler } from "@/app/api/agent/message/handler";
import { createPostHandler as createCartCommandPostHandler } from "@/app/api/agent/cart-command/handler";
import { db } from "@/db";
import { carts } from "@/db/schema/cart";
import { products } from "@/db/schema/catalog";
import { approvals, checkoutProposals } from "@/db/schema/checkout";
import { brands } from "@/db/schema/identity";
import { createCatalogModule } from "@/modules/catalog/catalog";
import { createCartModule } from "@/modules/cart/cart";
import { createCommerceAgent } from "@/modules/agent/commerce-agent";
import { createConversationModule } from "@/modules/agent/conversation";
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

test("POST adds multiple identified Products through one real atomic Cart mutation", async () => {
  await runSeedCommand();
  await db.delete(approvals).where(eq(approvals.userId, DEMO_CUSTOMER_ID));
  await db
    .delete(checkoutProposals)
    .where(eq(checkoutProposals.userId, DEMO_CUSTOMER_ID));
  await db.delete(carts).where(eq(carts.userId, DEMO_CUSTOMER_ID));

  const catalog = createCatalogModule();
  const selected = (await catalog.search({
    queries: ["running shoes"],
    category: "Footwear",
    limit: 2,
  })).products;
  assert.equal(selected.length, 2);

  const agent = createCommerceAgent(
    catalog,
    {
      async analyze({ message }) {
        if (message === "Show me running shoes") {
          return {
            goal: "Find running shoes",
            constraintDelta: {
              set: { productTypes: ["running shoes"], category: "Footwear" },
              clear: [],
            },
            knownEntities: [],
            missingInformation: [],
            confidence: 0.99,
            requestedEffects: ["DISCOVER_PRODUCTS"],
          };
        }
        return {
          goal: "Add both running shoes",
          constraintDelta: { set: {}, clear: [] },
          knownEntities: [],
          missingInformation: [],
          confidence: 0.99,
          requestedEffects: ["ADD_TO_CART"],
          referencedProductIds: selected.map(({ id }) => id),
          requestedAdditions: [
            { productId: selected[0].id, quantity: 2 },
            { productId: selected[1].id, quantity: 1 },
          ],
        };
      },
    },
    createConversationModule(DEMO_CUSTOMER_ID),
    {
      agentLoop: {
        async run({ capabilities }) {
          const result = await capabilities.searchProducts?.({
            queries: ["running shoes"],
            category: "Footwear",
            limit: 2,
          });
          assert.ok(result);
          return {
            status: "COMPLETED",
            message: "Two running shoes.",
            productIds: result.products.map(({ id }) => id),
          };
        },
      },
      cart: createCartModule(DEMO_CUSTOMER_ID),
    },
  );
  const POST = createPostHandler(async () => agent);
  const post = (body: Record<string, unknown>) => POST(new Request(
    "http://localhost/api/agent/message",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  ));

  const discovery = await post({
    message: "Show me running shoes",
    idempotencyKey: "61000000-0000-4000-8000-000000000001",
  });
  const discoveryOutcome = (await discovery.json()).data;
  const addition = await post({
    conversationId: discoveryOutcome.conversationId,
    message: "Add two of the first and one of the second",
    idempotencyKey: "61000000-0000-4000-8000-000000000002",
  });
  const outcome = (await addition.json()).data;

  assert.equal(outcome.status, "COMPLETED");
  assert.deepEqual(
    outcome.cart.items.map((item: { productId: string; quantity: number }) => ({
      productId: item.productId,
      quantity: item.quantity,
    })),
    [
      { productId: selected[0].id, quantity: 2 },
      { productId: selected[1].id, quantity: 1 },
    ],
  );
  assert.equal(outcome.cart.totalQuantity, 3);
});

async function prepareCart() {
  await runSeedCommand();
  await db.delete(approvals).where(eq(approvals.userId, DEMO_CUSTOMER_ID));
  await db
    .delete(checkoutProposals)
    .where(eq(checkoutProposals.userId, DEMO_CUSTOMER_ID));
  await db.delete(carts).where(eq(carts.userId, DEMO_CUSTOMER_ID));
  const catalog = createCatalogModule();
  const result = await catalog.search({
    query: "StrideFlow Daily Running Shoes",
    limit: 1,
  });
  const product = result.products[0];
  assert.ok(product);
  return { cart: createCartModule(DEMO_CUSTOMER_ID), product };
}

test("Cart clearing removes every Cart Item and returns the authoritative empty Cart", async () => {
  const { cart, product } = await prepareCart();
  const catalog = createCatalogModule();
  const [secondProduct] = (await catalog.search({
    query: "TrailCrest Grip Running Shoes",
    limit: 1,
  })).products;
  assert.ok(secondProduct);
  await cart.addItems([
    { product, quantity: 2 },
    { product: secondProduct, quantity: 1 },
  ], async () => {});

  const cleared = await cart.applyMutations!([{ type: "CLEAR" }], async () => {});

  assert.deepEqual(cleared.items, []);
  assert.equal(cleared.totalQuantity, 0);
  assert.equal(cleared.subtotalMinor, 0);
  assert.deepEqual(await cart.inspect(), cleared);
});

test("one Cart Mutation batch atomically adds, removes, and changes quantities", async () => {
  const { cart, product: strideFlow } = await prepareCart();
  const catalog = createCatalogModule();
  const getProduct = async (query: string) => {
    const [product] = (await catalog.search({ query, limit: 1 })).products;
    assert.ok(product);
    return product;
  };
  const trailCrest = await getProduct("TrailCrest Grip Running Shoes");
  const flexForge = await getProduct("FlexForge Training Shoes");
  const courtLine = await getProduct("CourtLine Casual Sneakers");
  await cart.addItems([
    { product: strideFlow, quantity: 2 },
    { product: trailCrest, quantity: 1 },
    { product: flexForge, quantity: 2 },
  ], async () => {});

  const updated = await cart.applyMutations!([
    { type: "ADD", product: courtLine, quantity: 1 },
    { type: "REMOVE", reference: trailCrest.name },
    {
      type: "CHANGE_QUANTITY",
      reference: strideFlow.name,
      change: { mode: "RELATIVE", quantity: 1 },
    },
    {
      type: "CHANGE_QUANTITY",
      reference: flexForge.name,
      change: { mode: "EXACT", quantity: 3 },
    },
  ], async () => {});

  assert.deepEqual(
    updated.items.map(({ productId, quantity }) => ({ productId, quantity })),
    [
      { productId: strideFlow.id, quantity: 3 },
      { productId: flexForge.id, quantity: 3 },
      { productId: courtLine.id, quantity: 1 },
    ],
  );
  assert.equal(updated.totalQuantity, 7);
});

test("Cart command HTTP decrement uses the latest quantity when stock fell below the Cart quantity", async () => {
  const { cart, product } = await prepareCart();
  await cart.addItem(product, 5, async () => {});
  await db
    .update(products)
    .set({ stock: 2 })
    .where(eq(products.id, product.id));

  const conversation = createConversationModule(DEMO_CUSTOMER_ID);
  const setupTurn = await conversation.startTurn({
    idempotencyKey: crypto.randomUUID(),
    message: "Show my Cart",
  });
  const POST = createCartCommandPostHandler(async () => ({
    cart,
    conversation: createConversationModule(DEMO_CUSTOMER_ID),
  }));
  const response = await POST(new Request("http://localhost/api/agent/cart-command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      conversationId: setupTurn.conversationId,
      idempotencyKey: crypto.randomUUID(),
      command: {
        type: "CHANGE_CART_ITEM_QUANTITY",
        productId: product.id,
        mode: "RELATIVE",
        quantity: -1,
      },
    }),
  }));
  const updated = (await response.json()).data.cart;

  assert.equal(response.status, 200);
  assert.equal(updated.items[0].quantity, 4);
  assert.deepEqual(updated.items[0].availabilityWarning, {
    reason: "INSUFFICIENT_STOCK",
    availableQuantity: 2,
  });
});

test("a mixed batch resolves an unqualified change against its sole untargeted Cart Item", async () => {
  const { cart, product: strideFlow } = await prepareCart();
  const [trailCrest] = (await createCatalogModule().search({
    query: "TrailCrest Grip Running Shoes",
    limit: 1,
  })).products;
  assert.ok(trailCrest);
  await cart.addItems([
    { product: strideFlow, quantity: 2 },
    { product: trailCrest, quantity: 1 },
  ], async () => {});

  const updated = await cart.applyMutations!([
    { type: "REMOVE", reference: trailCrest.name },
    {
      type: "CHANGE_QUANTITY",
      change: { mode: "RELATIVE", quantity: 1 },
    },
  ], async () => {});

  assert.deepEqual(
    updated.items.map(({ productId, quantity }) => ({ productId, quantity })),
    [{ productId: strideFlow.id, quantity: 3 }],
  );
});

test("unqualified mixed Cart Item resolution does not depend on operation order", async () => {
  const { cart, product: strideFlow } = await prepareCart();
  const [trailCrest] = (await createCatalogModule().search({
    query: "TrailCrest Grip Running Shoes",
    limit: 1,
  })).products;
  assert.ok(trailCrest);
  await cart.addItems([
    { product: strideFlow, quantity: 2 },
    { product: trailCrest, quantity: 1 },
  ], async () => {});

  const updated = await cart.applyMutations!([
    {
      type: "CHANGE_QUANTITY",
      change: { mode: "RELATIVE", quantity: 1 },
    },
    { type: "REMOVE", reference: trailCrest.name },
  ], async () => {});

  assert.deepEqual(
    updated.items.map(({ productId, quantity }) => ({ productId, quantity })),
    [{ productId: strideFlow.id, quantity: 3 }],
  );
});

test("an invalid Cart Mutation rolls back every operation in its batch", async () => {
  const { cart, product: strideFlow } = await prepareCart();
  const [courtLine] = (await createCatalogModule().search({
    query: "CourtLine Casual Sneakers",
    limit: 1,
  })).products;
  assert.ok(courtLine);
  await cart.addItem(strideFlow, 2, async () => {});
  const before = await cart.inspect();

  await assert.rejects(
    cart.applyMutations!([
      { type: "ADD", product: courtLine, quantity: 1 },
      {
        type: "CHANGE_QUANTITY",
        reference: strideFlow.name,
        change: { mode: "EXACT", quantity: 11 },
      },
    ], async () => {}),
    /cannot have more than 10 units/,
  );

  assert.deepEqual(await cart.inspect(), before);
});

test("a Cart Mutation batch rolls back when Conversation Turn completion fails", async () => {
  const { cart, product: strideFlow } = await prepareCart();
  const [courtLine] = (await createCatalogModule().search({
    query: "CourtLine Casual Sneakers",
    limit: 1,
  })).products;
  assert.ok(courtLine);
  await cart.addItem(strideFlow, 2, async () => {});
  const before = await cart.inspect();

  await assert.rejects(
    cart.applyMutations!([
      { type: "ADD", product: courtLine, quantity: 1 },
      {
        type: "CHANGE_QUANTITY",
        reference: strideFlow.name,
        change: { mode: "RELATIVE", quantity: 1 },
      },
    ], async () => {
      throw new Error("Conversation Turn completion failed");
    }),
    /Conversation Turn completion failed/,
  );

  assert.deepEqual(await cart.inspect(), before);
});

test("duplicate, contradictory, and ambiguous Cart Mutation batches have no partial effects", async () => {
  const { cart, product: strideFlow } = await prepareCart();
  const catalog = createCatalogModule();
  const [trailCrest] = (await catalog.search({
    query: "TrailCrest Grip Running Shoes",
    limit: 1,
  })).products;
  const [courtLine] = (await catalog.search({
    query: "CourtLine Casual Sneakers",
    limit: 1,
  })).products;
  assert.ok(trailCrest);
  assert.ok(courtLine);
  await cart.addItems([
    { product: strideFlow, quantity: 2 },
    { product: trailCrest, quantity: 1 },
  ], async () => {});

  const original = await cart.inspect();
  await assert.rejects(
    cart.applyMutations!([
      { type: "ADD", product: courtLine, quantity: 1 },
      { type: "ADD", product: courtLine, quantity: 1 },
    ], async () => {}),
    /same Product cannot be added more than once/,
  );
  assert.deepEqual(await cart.inspect(), original);

  await assert.rejects(
    cart.applyMutations!([
      { type: "REMOVE", reference: strideFlow.name },
      {
        type: "CHANGE_QUANTITY",
        reference: strideFlow.name,
        change: { mode: "RELATIVE", quantity: 1 },
      },
    ], async () => {}),
    /duplicate or contradictory/,
  );
  assert.deepEqual(await cart.inspect(), original);

  await db
    .update(products)
    .set({ name: strideFlow.name })
    .where(eq(products.id, trailCrest.id));
  const ambiguous = await cart.inspect();
  await assert.rejects(
    cart.applyMutations!([
      { type: "ADD", product: courtLine, quantity: 1 },
      { type: "REMOVE", reference: strideFlow.name },
    ], async () => {}),
    /More than one Cart Item matches/,
  );
  assert.deepEqual(await cart.inspect(), ambiguous);
});

test("POST safely clears an already-empty Cart and replays its original result", async () => {
  const { cart } = await prepareCart();
  let analyses = 0;
  const agent = createCommerceAgent(
    createCatalogModule(),
    {
      async analyze() {
        analyses += 1;
        return {
          goal: "Clear the Cart",
          constraintDelta: { set: {}, clear: [] },
          knownEntities: [],
          missingInformation: [],
          confidence: 0.99,
          requestedEffects: ["CLEAR_CART" as const],
        };
      },
    },
    createConversationModule(DEMO_CUSTOMER_ID),
    {
      agentLoop: { async run() { throw new Error("not used"); } },
      cart,
    },
  );
  const POST = createPostHandler(async () => agent);
  const request = new Request("http://localhost/api/agent/message", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: "Clear my Cart",
      idempotencyKey: crypto.randomUUID(),
    }),
  });

  const first = await POST(request.clone());
  const second = await POST(request.clone());

  assert.deepEqual(await second.json(), await first.json());
  assert.equal(analyses, 1);
  assert.deepEqual((await cart.inspect()).items, []);
});

test("a successful Cart Mutation batch advances one version and invalidates stale checkout state", async () => {
  const { cart, product } = await prepareCart();
  const [courtLine] = (await createCatalogModule().search({
    query: "CourtLine Casual Sneakers",
    limit: 1,
  })).products;
  assert.ok(courtLine);
  await cart.addItem(product, 2, async () => {});
  const [before] = await db
    .select({ id: carts.id, version: carts.version })
    .from(carts)
    .where(and(eq(carts.userId, DEMO_CUSTOMER_ID), eq(carts.status, "ACTIVE")))
    .limit(1);
  const [proposal] = await db
    .insert(checkoutProposals)
    .values({
      cartId: before.id,
      userId: DEMO_CUSTOMER_ID,
      cartVersion: before.version,
      status: "APPROVAL_PENDING",
      policyDecision: "REQUIRES_APPROVAL",
      subtotalMinor: product.priceMinor * 2,
      discountMinor: 0,
      shippingMinor: 0,
      taxMinor: 0,
      totalMinor: product.priceMinor * 2,
      currency: product.currency,
      expiresAt: new Date(Date.now() + 60_000),
    })
    .returning({ id: checkoutProposals.id });
  await db.insert(approvals).values({
    proposalId: proposal.id,
    userId: DEMO_CUSTOMER_ID,
    actionType: "PLACE_ORDER",
    amountMinor: product.priceMinor * 2,
    currency: product.currency,
    reason: "Customer Approval required",
    status: "PENDING",
    expiresAt: new Date(Date.now() + 60_000),
  });

  await cart.applyMutations!([
    { type: "ADD", product: courtLine, quantity: 1 },
    {
      type: "CHANGE_QUANTITY",
      reference: product.name,
      change: { mode: "RELATIVE", quantity: 1 },
    },
  ], async () => {});

  const [afterBatch] = await db
    .select({ version: carts.version })
    .from(carts)
    .where(eq(carts.id, before.id));
  const [invalidatedProposal] = await db
    .select({ status: checkoutProposals.status })
    .from(checkoutProposals)
    .where(eq(checkoutProposals.id, proposal.id));
  const [invalidatedApproval] = await db
    .select({ status: approvals.status })
    .from(approvals)
    .where(eq(approvals.proposalId, proposal.id));
  assert.equal(afterBatch.version, before.version + 1);
  assert.equal(invalidatedProposal.status, "INVALIDATED");
  assert.equal(invalidatedApproval.status, "INVALIDATED");
});

function createQuantityChangePost(
  productName: string | undefined,
  cart = createCartModule(DEMO_CUSTOMER_ID),
) {
  const agent = createCommerceAgent(
    createCatalogModule(),
    {
      async analyze({ message }) {
        const exact = message.match(/exact (-?\d+(?:\.\d+)?)/i);
        const relative = message.match(/relative (-?\d+(?:\.\d+)?)/i);
        return {
          goal: "Change a Cart Item quantity",
          constraintDelta: { set: {}, clear: [] },
          knownEntities: productName
            ? [{ type: "PRODUCT" as const, value: productName }]
            : [],
          missingInformation: [],
          confidence: 0.99,
          requestedEffects: ["CHANGE_CART_QUANTITY" as const],
          ...(productName ? { requestedCartItemReference: productName } : {}),
          ...((exact || relative)
            ? {
                requestedCartQuantityChange: {
                  mode: exact ? ("EXACT" as const) : ("RELATIVE" as const),
                  quantity: Number((exact ?? relative)![1]),
                },
              }
            : {}),
        };
      },
    },
    createConversationModule(DEMO_CUSTOMER_ID),
    {
      agentLoop: { async run() { throw new Error("not used"); } },
      cart,
    },
  );
  const POST = createPostHandler(async () => agent);
  return (body: Record<string, unknown>) => POST(new Request(
    "http://localhost/api/agent/message",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  ));
}

test("POST serializes relative Cart Quantity Changes and exact changes replace current quantity", async () => {
  const { cart, product } = await prepareCart();
  await cart.addItem(product, 2, async () => {});
  const post = createQuantityChangePost(product.name, cart);
  const initial = await post({
    message: "exact 2",
    idempotencyKey: crypto.randomUUID(),
  });
  const conversationId = (await initial.json()).data.conversationId;

  const [first, second] = await Promise.all([
    post({
      conversationId,
      message: "relative 1",
      idempotencyKey: crypto.randomUUID(),
    }),
    post({
      conversationId,
      message: "relative 1",
      idempotencyKey: crypto.randomUUID(),
    }),
  ]);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal((await cart.inspect()).items[0].quantity, 4);

  const exact = await post({
    conversationId,
    message: "exact 3",
    idempotencyKey: crypto.randomUUID(),
  });
  assert.equal((await exact.json()).data.cart.items[0].quantity, 3);
});

test("POST reprices an increased Cart Item at the current Product price and discloses it", async () => {
  const { cart, product } = await prepareCart();
  await cart.addItem(product, 2, async () => {});
  await db
    .update(products)
    .set({ priceMinor: 429900 })
    .where(eq(products.id, product.id));
  const response = await createQuantityChangePost(product.name, cart)({
    message: "relative 1",
    idempotencyKey: crypto.randomUUID(),
  });
  const outcome = (await response.json()).data;

  assert.equal(outcome.status, "COMPLETED");
  assert.equal(
    outcome.message,
    "Changed StrideFlow Daily Running Shoes quantity to 3. Its Cart Price increased from ₹3,999.00 to ₹4,299.00.",
  );
  assert.equal(outcome.cart.items[0].cartPriceMinor, 429900);
  assert.equal(outcome.cart.items[0].subtotalMinor, 1289700);
});

test("POST decreases an inactive Cart Item without repricing or removing it", async () => {
  const { cart, product } = await prepareCart();
  await cart.addItem(product, 3, async () => {});
  await db
    .update(products)
    .set({ active: false, stock: 0, priceMinor: 429900 })
    .where(eq(products.id, product.id));
  const response = await createQuantityChangePost(product.name, cart)({
    message: "relative -1",
    idempotencyKey: crypto.randomUUID(),
  });
  const outcome = (await response.json()).data;

  assert.equal(outcome.status, "COMPLETED");
  assert.equal(outcome.cart.items[0].quantity, 2);
  assert.equal(outcome.cart.items[0].cartPriceMinor, 399900);
  assert.equal(outcome.cart.items[0].subtotalMinor, 799800);
  assert.deepEqual(outcome.cart.items[0].availabilityWarning, {
    reason: "INACTIVE",
  });
  assert.equal(outcome.cart.priceChanges, undefined);
});

test("POST returns the unchanged authoritative Cart for quantity, stock, and inactivity failures", async () => {
  const { cart, product } = await prepareCart();
  await cart.addItem(product, 5, async () => {});
  const post = createQuantityChangePost(product.name, cart);
  const unqualifiedPost = createQuantityChangePost(undefined, cart);
  const invalidLimit = await post({
    message: "exact 11",
    idempotencyKey: crypto.randomUUID(),
  });
  assert.equal((await invalidLimit.json()).data.status, "NEEDS_INPUT");
  assert.equal((await cart.inspect()).items[0].quantity, 5);

  const unqualifiedLimit = await unqualifiedPost({
    message: "exact 11",
    idempotencyKey: crypto.randomUUID(),
  });
  assert.match(
    (await unqualifiedLimit.json()).data.message,
    /StrideFlow Daily Running Shoes cannot have more than 10 units/,
  );

  await db.update(products).set({ stock: 2 }).where(eq(products.id, product.id));
  const aboveStockDecrease = await post({
    message: "relative -1",
    idempotencyKey: crypto.randomUUID(),
  });
  assert.match((await aboveStockDecrease.json()).data.message, /2 units in stock/);
  assert.equal((await cart.inspect()).items[0].quantity, 5);

  const insufficientStock = await post({
    message: "relative 1",
    idempotencyKey: crypto.randomUUID(),
  });
  assert.match((await insufficientStock.json()).data.message, /2 units in stock/);
  assert.equal((await cart.inspect()).items[0].quantity, 5);

  await db
    .update(products)
    .set({ active: false, stock: 10 })
    .where(eq(products.id, product.id));
  const inactive = await post({
    message: "relative 1",
    idempotencyKey: crypto.randomUUID(),
  });
  assert.match((await inactive.json()).data.message, /inactive/);
  assert.equal((await cart.inspect()).items[0].quantity, 5);

  const implicitRemoval = await post({
    message: "relative -5",
    idempotencyKey: crypto.randomUUID(),
  });
  assert.match((await implicitRemoval.json()).data.message, /Remove the Cart Item explicitly/);
  assert.equal((await cart.inspect()).items[0].quantity, 5);
});

test("POST applies a retried relative Cart Quantity Change only once", async () => {
  const { cart, product } = await prepareCart();
  await cart.addItem(product, 2, async () => {});
  const post = createQuantityChangePost(product.name, cart);
  const request = {
    message: "relative 1",
    idempotencyKey: crypto.randomUUID(),
  };

  const first = await post(request);
  const second = await post(request);

  assert.deepEqual(await second.json(), await first.json());
  assert.equal((await cart.inspect()).items[0].quantity, 3);
});

test("POST atomically invalidates checkout state with a Cart Quantity Change", async () => {
  const { cart, product } = await prepareCart();
  await cart.addItem(product, 2, async () => {});
  const [activeCart] = await db
    .select({ id: carts.id, version: carts.version })
    .from(carts)
    .where(and(eq(carts.userId, DEMO_CUSTOMER_ID), eq(carts.status, "ACTIVE")))
    .limit(1);
  const [proposal] = await db
    .insert(checkoutProposals)
    .values({
      cartId: activeCart.id,
      userId: DEMO_CUSTOMER_ID,
      cartVersion: activeCart.version,
      status: "APPROVAL_PENDING",
      policyDecision: "REQUIRES_APPROVAL",
      subtotalMinor: product.priceMinor * 2,
      discountMinor: 0,
      shippingMinor: 0,
      taxMinor: 0,
      totalMinor: product.priceMinor * 2,
      currency: product.currency,
      expiresAt: new Date(Date.now() + 60_000),
    })
    .returning({ id: checkoutProposals.id });
  await db.insert(approvals).values({
    proposalId: proposal.id,
    userId: DEMO_CUSTOMER_ID,
    actionType: "PLACE_ORDER",
    amountMinor: product.priceMinor * 2,
    currency: product.currency,
    reason: "Customer Approval required",
    status: "PENDING",
    expiresAt: new Date(Date.now() + 60_000),
  });

  const response = await createQuantityChangePost(product.name, cart)({
    message: "exact 3",
    idempotencyKey: crypto.randomUUID(),
  });
  assert.equal((await response.json()).data.status, "COMPLETED");

  const [invalidatedProposal] = await db
    .select({ status: checkoutProposals.status })
    .from(checkoutProposals)
    .where(eq(checkoutProposals.id, proposal.id));
  const [invalidatedApproval] = await db
    .select({ status: approvals.status })
    .from(approvals)
    .where(eq(approvals.proposalId, proposal.id));
  assert.equal(invalidatedProposal.status, "INVALIDATED");
  assert.equal(invalidatedApproval.status, "INVALIDATED");
});

test("POST rolls back a Cart Quantity Change when Conversation Turn completion fails", async () => {
  const { cart, product } = await prepareCart();
  await cart.addItem(product, 2, async () => {});
  const agent = createCommerceAgent(
    createCatalogModule(),
    {
      async analyze() {
        return {
          goal: "Change a Cart Item quantity",
          constraintDelta: { set: {}, clear: [] },
          knownEntities: [{ type: "PRODUCT" as const, value: product.name }],
          missingInformation: [],
          confidence: 0.99,
          requestedEffects: ["CHANGE_CART_QUANTITY" as const],
          requestedCartItemReference: product.name,
          requestedCartQuantityChange: { mode: "EXACT" as const, quantity: 3 },
        };
      },
    },
    {
      async startTurn() {
        return {
          conversationId: "41000000-0000-4000-8000-000000000016",
          async recordIntentBrief() {},
          async complete() {
            throw new Error("Conversation Turn completion failed");
          },
        };
      },
    },
    {
      agentLoop: { async run() { throw new Error("not used"); } },
      cart,
    },
  );
  const POST = createPostHandler(async () => agent);
  const response = await POST(new Request("http://localhost/api/agent/message", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: "exact 3",
      idempotencyKey: crypto.randomUUID(),
    }),
  }));

  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.status, "TEMPORARILY_UNAVAILABLE");
  assert.equal((await cart.inspect()).items[0].quantity, 2);
});

test("Cart additions do not reserve Product stock", async () => {
  const { cart, product } = await prepareCart();
  const [stockBeforeAddition] = await db
    .select({ stock: products.stock })
    .from(products)
    .where(eq(products.id, product.id));
  await Promise.all([
    cart.addItem(product, 1, async () => {}),
    cart.addItem(product, 1, async () => {}),
  ]);
  const [stockAfterAddition] = await db
    .select({ stock: products.stock })
    .from(products)
    .where(eq(products.id, product.id));

  assert.equal(stockAfterAddition.stock, stockBeforeAddition.stock);
  assert.equal((await cart.inspect()).totalQuantity, 2);
});

test("Cart Item Removal invalidates its unconsumed Checkout Proposal and pending Approval", async () => {
  const { cart, product } = await prepareCart();
  await cart.addItem(product, 1, async () => {});
  const [activeCart] = await db
    .select({ id: carts.id, version: carts.version })
    .from(carts)
    .where(and(eq(carts.userId, DEMO_CUSTOMER_ID), eq(carts.status, "ACTIVE")))
    .limit(1);
  assert.ok(activeCart);
  const [proposal] = await db
    .insert(checkoutProposals)
    .values({
      cartId: activeCart.id,
      userId: DEMO_CUSTOMER_ID,
      cartVersion: activeCart.version,
      status: "APPROVAL_PENDING",
      policyDecision: "REQUIRES_APPROVAL",
      subtotalMinor: product.priceMinor,
      discountMinor: 0,
      shippingMinor: 0,
      taxMinor: 0,
      totalMinor: product.priceMinor,
      currency: product.currency,
      expiresAt: new Date(Date.now() + 60_000),
    })
    .returning({ id: checkoutProposals.id });
  await db.insert(approvals).values({
    proposalId: proposal.id,
    userId: DEMO_CUSTOMER_ID,
    actionType: "PLACE_ORDER",
    amountMinor: product.priceMinor,
    currency: product.currency,
    reason: "Customer Approval required",
    status: "PENDING",
    expiresAt: new Date(Date.now() + 60_000),
  });

  await cart.removeItemByProductId!(product.id, async () => {});

  const [invalidatedProposal] = await db
    .select({ status: checkoutProposals.status })
    .from(checkoutProposals)
    .where(eq(checkoutProposals.id, proposal.id));
  const [invalidatedApproval] = await db
    .select({ status: approvals.status })
    .from(approvals)
    .where(eq(approvals.proposalId, proposal.id));
  assert.equal(invalidatedProposal.status, "INVALIDATED");
  assert.equal(invalidatedApproval.status, "INVALIDATED");
});

test("Cart Item Removal remains allowed when its Product is inactive and out of stock", async () => {
  const { cart, product } = await prepareCart();
  await cart.addItem(product, 2, async () => {});
  await db
    .update(products)
    .set({ active: false, stock: 0 })
    .where(eq(products.id, product.id));

  const removed = await cart.removeItem!(product.name, async () => {});

  assert.ok(removed);
  assert.deepEqual(removed.items, []);
  assert.equal(removed.totalQuantity, 0);
  assert.equal(removed.subtotalMinor, 0);
});

test("structured Cart Item Removal targets the stable Product ID", async () => {
  const { cart, product } = await prepareCart();
  await cart.addItem(product, 1, async () => {});

  const removed = await cart.removeItemByProductId!(product.id, async () => {});

  assert.deepEqual(removed.items, []);
  assert.equal(removed.totalQuantity, 0);
  assert.equal(removed.subtotalMinor, 0);
});

test("Undo restores the removed Product with its exact prior quantity and Cart Price", async () => {
  const { cart, product } = await prepareCart();
  await cart.addItem(product, 2, async () => {});
  const removalId = crypto.randomUUID();
  let offeredUndo:
    | { removalId: string; productId: string; productName: string; expiresAt: string }
    | undefined;

  await cart.removeItemByProductId!(
    product.id,
    async (_removedCart, _transaction, details) => {
      offeredUndo = details?.cartItemRemovalUndo;
    },
    removalId,
  );
  await db
    .update(products)
    .set({ priceMinor: product.priceMinor + 50_000 })
    .where(eq(products.id, product.id));
  const restored = await cart.restoreItemRemoval!(removalId, async () => {});

  assert.equal(offeredUndo?.removalId, removalId);
  assert.equal(offeredUndo?.productId, product.id);
  assert.equal(offeredUndo?.productName, product.name);
  assert.ok(Date.parse(offeredUndo?.expiresAt ?? "") > Date.now());
  assert.equal(restored.items[0].productId, product.id);
  assert.equal(restored.items[0].quantity, 2);
  assert.equal(restored.items[0].cartPriceMinor, product.priceMinor);
  assert.equal(restored.items[0].subtotalMinor, product.priceMinor * 2);
});

test("Undo expires ten seconds after Cart Item Removal without changing the Cart", async () => {
  const { cart: setupCart, product } = await prepareCart();
  await setupCart.addItem(product, 1, async () => {});
  let currentTime = new Date("2026-09-01T06:30:00.000Z");
  const cart = createCartModule(DEMO_CUSTOMER_ID, "INR", () => currentTime);
  const removalId = crypto.randomUUID();
  await cart.removeItemByProductId!(
    product.id,
    async () => {},
    removalId,
  );

  currentTime = new Date("2026-09-01T06:30:10.000Z");

  await assert.rejects(
    cart.restoreItemRemoval!(removalId, async () => {}),
    /Undo expired after ten seconds\./,
  );
  assert.deepEqual((await cart.inspect()).items, []);
});

test("Undo leaves the Cart unchanged when the removed Product is no longer available", async () => {
  const { cart, product } = await prepareCart();
  await cart.addItem(product, 1, async () => {});
  const removalId = crypto.randomUUID();
  await cart.removeItemByProductId!(
    product.id,
    async () => {},
    removalId,
  );
  await db
    .update(products)
    .set({ active: false })
    .where(eq(products.id, product.id));

  await assert.rejects(
    cart.restoreItemRemoval!(removalId, async () => {}),
    new RegExp(`${product.name} is no longer available\\.`),
  );
  assert.deepEqual((await cart.inspect()).items, []);
});

test("Undo leaves the Cart unchanged when stock no longer covers the removed quantity", async () => {
  const { cart, product } = await prepareCart();
  await cart.addItem(product, 2, async () => {});
  const removalId = crypto.randomUUID();
  await cart.removeItemByProductId!(
    product.id,
    async () => {},
    removalId,
  );
  await db
    .update(products)
    .set({ stock: 1 })
    .where(eq(products.id, product.id));

  await assert.rejects(
    cart.restoreItemRemoval!(removalId, async () => {}),
    new RegExp(`${product.name} only has 1 unit in stock\\.`),
  );
  assert.deepEqual((await cart.inspect()).items, []);
});

test("Cart Item Removal rolls back when Conversation Turn completion fails", async () => {
  const { cart, product } = await prepareCart();
  await cart.addItem(product, 1, async () => {});

  await assert.rejects(
    cart.removeItemByProductId!(product.id, async () => {
      throw new Error("Conversation Turn completion failed");
    }),
    /Conversation Turn completion failed/,
  );

  const unchanged = await cart.inspect();
  assert.equal(unchanged.items[0].productId, product.id);
  assert.equal(unchanged.items[0].quantity, 1);
});

test("Cart inspection discloses base price changes without repricing", async () => {
  const { cart, product } = await prepareCart();
  await cart.addItem(product, 2, async () => {});

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

  await db
    .update(products)
    .set({ priceMinor: 379900 })
    .where(eq(products.id, product.id));
  const decreased = await cart.inspect();

  assert.equal(decreased.items[0].cartPriceMinor, 399900);
  assert.equal(decreased.subtotalMinor, 799800);
  assert.deepEqual(decreased.items[0].priceComparison, {
    currentBasePriceMinor: 379900,
    direction: "DECREASED",
  });
});

test("adding a Product again reprices its entire Cart Item", async () => {
  const { cart, product } = await prepareCart();
  await cart.addItem(product, 2, async () => {});
  await db
    .update(products)
    .set({ priceMinor: 429900 })
    .where(eq(products.id, product.id));

  const repriced = await cart.addItem(product, 1, async () => {});

  assert.equal(repriced.items[0].quantity, 3);
  assert.equal(repriced.items[0].cartPriceMinor, 429900);
  assert.equal(repriced.items[0].subtotalMinor, 1289700);
  assert.deepEqual(repriced.priceChanges, [
    {
      productId: product.id,
      previousCartPriceMinor: 399900,
      currentCartPriceMinor: 429900,
      direction: "INCREASED",
    },
  ]);
});

test("Cart inspection warns about current Product availability", async () => {
  const { cart, product } = await prepareCart();
  await cart.addItem(product, 3, async () => {});

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
