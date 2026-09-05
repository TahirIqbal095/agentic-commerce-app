import assert from "node:assert/strict";
import test from "node:test";
import {
  createCommerceAgent,
  type CommerceAgent,
  type CommerceAgentLoop,
} from "@/modules/agent/commerce-agent";
import type { ProductCatalog } from "@/modules/catalog/catalog";
import type { CartModule } from "@/modules/cart/cart";
import { createCartInspection } from "@/modules/cart/cart-inspection";
import {
  createConversationModule,
  ConversationAccessError,
} from "@/modules/agent/conversation";
import {
  createEmptyConversationContext as emptyConversationContext,
  type ConversationContext,
  type IntentAnalysis,
  type IntentAnalyzer,
  type ShoppingIntent,
} from "@/modules/agent/intent";
import type { AgentOutcome } from "@/modules/agent/agent-outcome";
import type { ConversationRepository } from "@/modules/agent/conversation-repository";
import type { CatalogSearch } from "@/modules/catalog/types";
import { createPostHandler } from "./handler";
import { createMessageRoute } from "./route-factory";
import type {
  GuestSession,
  GuestSessionStore,
} from "@/modules/identity/guest-session";

const conversationId = "41000000-0000-4000-8000-000000000001";
const guestSessionId = "11000000-0000-4000-8000-000000000001";

function cookiePair(response: Response): string {
  return response.headers.get("set-cookie")!.split(";")[0];
}

async function postRouteMessage(
  route: (request: Request) => Promise<Response>,
  body: { conversationId?: string; message: string },
  cookie?: string,
) {
  return route(
    new Request("https://storefront.example/api/agent/message", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify({ ...body, idempotencyKey: crypto.randomUUID() }),
    }),
  );
}

function createInMemoryConversationRepository(): ConversationRepository {
  let persistedContext: ConversationContext | undefined;
  return {
    async findDuplicate() {
      return null;
    },
    async create() {
      persistedContext = emptyConversationContext();
      return {
        conversationId,
        customerMessageId: "51000000-0000-4000-8000-000000000001",
        context: persistedContext,
      };
    },
    async findOwnedContext() {
      return persistedContext
        ? { guestSessionId, context: persistedContext }
        : null;
    },
    async saveContextAndMetadata(_conversationId, context) {
      persistedContext = context;
    },
    async saveRecommendationSet(
      _conversationId,
      expectedRevision,
      recommendations,
    ) {
      if (!persistedContext || persistedContext.revision !== expectedRevision) {
        return false;
      }
      persistedContext = {
        ...persistedContext,
        latestRecommendationSet: recommendations,
      };
      return true;
    },
    async append() {
      return "51000000-0000-4000-8000-000000000002";
    },
  };
}

test("a Guest Session cannot continue another Guest Session's Conversation", async () => {
  const sessionsByTokenHash = new Map<string, GuestSession>();
  const conversationOwners = new Map<string, string>();
  let nextSession = 0;
  const store: GuestSessionStore = {
    async findActiveAndRefresh(tokenHash) {
      return sessionsByTokenHash.get(tokenHash) ?? null;
    },
    async create({ tokenHash }) {
      nextSession += 1;
      const session = { id: `guest-session-${nextSession}` };
      sessionsByTokenHash.set(tokenHash, session);
      return session;
    },
  };
  const route = createMessageRoute({
    store,
    issueToken: () => `opaque-token-${nextSession + 1}`,
    async createAgent(guestSession) {
      return {
        async respond(input) {
          if (input.conversationId) {
            if (
              conversationOwners.get(input.conversationId) !== guestSession.id
            ) {
              throw new ConversationAccessError();
            }
            return {
              status: "COMPLETED",
              conversationId: input.conversationId,
              message: "Conversation continued.",
              intentBrief: {
                goal: "Continue Conversation",
                constraints: emptyConversationContext().productConstraints,
                knownEntities: [],
                missingInformation: [],
                confidence: 1,
                requestedEffects: [],
              },
              products: [],
            } satisfies AgentOutcome;
          }

          const newConversationId = crypto.randomUUID();
          conversationOwners.set(newConversationId, guestSession.id);
          return {
            status: "COMPLETED",
            conversationId: newConversationId,
            message: "Conversation started.",
            intentBrief: {
              goal: "Start Conversation",
              constraints: emptyConversationContext().productConstraints,
              knownEntities: [],
              missingInformation: [],
              confidence: 1,
              requestedEffects: [],
            },
            products: [],
          } satisfies AgentOutcome;
        },
      };
    },
  });

  const firstConversation = await postRouteMessage(route, {
    message: "show me shoes",
  });
  const secondConversation = await postRouteMessage(route, {
    message: "show me jackets",
  });
  const firstBody = await firstConversation.json();

  const crossSessionResponse = await postRouteMessage(
    route,
    {
      conversationId: firstBody.data.conversationId,
      message: "continue that Conversation",
    },
    cookiePair(secondConversation),
  );

  assert.equal(crossSessionResponse.status, 404);
  assert.deepEqual(await crossSessionResponse.json(), {
    error: {
      code: "CONVERSATION_NOT_FOUND",
      message: "The conversation was not found.",
      details: {},
    },
  });
});

test("supplies only the latest ordered Recommendation Set to the next turn", async () => {
  const contexts: ConversationContext[] = [];
  const repository = createInMemoryConversationRepository();
  const products = [
    {
      id: "71000000-0000-4000-8000-000000000001",
      slug: "trail-one",
      name: "Trail One",
      description: "A grippy trail shoe",
      category: "Footwear",
      priceMinor: 350000,
      currency: "INR",
      inStock: true,
      attributes: {},
    },
    {
      id: "71000000-0000-4000-8000-000000000002",
      slug: "road-two",
      name: "Road Two",
      description: "A light road shoe",
      category: "Footwear",
      priceMinor: 390000,
      currency: "INR",
      inStock: false,
      attributes: {},
    },
  ];
  let turn = 0;
  const revalidatedProductIds: string[] = [];
  const POST = createConversationPost({
    repository,
    analyzer: {
      async analyze({ context }) {
        contexts.push(context);
        return {
          goal: "Discover Products",
          constraintDelta: { set: {}, clear: [] },
          knownEntities: [],
          missingInformation: [],
          confidence: 0.9,
          requestedEffects: ["DISCOVER_PRODUCTS"],
          ...(context.latestRecommendationSet.length > 0
            ? {
                referencedProductIds: [
                  context.latestRecommendationSet[1].productId,
                ],
              }
            : {}),
        };
      },
    },
    catalog: {
      async search() {
        return { products };
      },
      async getProduct(productId) {
        revalidatedProductIds.push(productId);
        return {
          ok: true,
          value: { ...products[1], priceMinor: 410000, inStock: true },
        };
      },
    },
    agentLoop: {
      async run({ capabilities, intentBrief }) {
        turn += 1;
        if (turn === 1) {
          assert.ok(capabilities.searchProducts);
          await capabilities.searchProducts({ limit: 8 });
          return {
            status: "COMPLETED",
            message: "Two options.",
            productIds: products.map((product) => product.id),
          };
        }
        assert.ok(capabilities.getProduct);
        const referencedProductId = intentBrief.referencedProductIds?.[0];
        assert.ok(referencedProductId);
        await capabilities.getProduct(referencedProductId);
        return {
          status: "COMPLETED",
          message: "The second Product is current.",
          productIds: [referencedProductId],
        };
      },
    },
  });

  const first = await postAgentMessage(POST, { message: "show me shoes" });
  const second = await postAgentMessage(POST, {
    conversationId: (await first.json()).data.conversationId,
    message: "tell me about the second one",
  });

  assert.deepEqual(contexts[1].latestRecommendationSet, [
    {
      productId: products[0].id,
      name: "Trail One",
      description: "A grippy trail shoe",
      category: "Footwear",
    },
    {
      productId: products[1].id,
      name: "Road Two",
      description: "A light road shoe",
      category: "Footwear",
    },
  ]);
  assert.equal("priceMinor" in contexts[1].latestRecommendationSet[1], false);
  assert.equal("inStock" in contexts[1].latestRecommendationSet[1], false);
  assert.deepEqual(revalidatedProductIds, [products[1].id]);
  assert.deepEqual((await second.json()).data.products[0], {
    ...products[1],
    priceMinor: 410000,
    inStock: true,
  });
});

async function postAgentMessage(
  POST: (request: Request) => Promise<Response>,
  body: { conversationId?: string; idempotencyKey?: string; message: string },
) {
  return POST(
    new Request("http://localhost/api/agent/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...body,
        idempotencyKey: body.idempotencyKey ?? crypto.randomUUID(),
      }),
    }),
  );
}

test("passes a Conversation Turn idempotency key to the Commerce Agent", async () => {
  const receivedInputs: Array<{
    idempotencyKey?: string;
    message: string;
  }> = [];
  const agent: CommerceAgent = {
    async respond(input) {
      receivedInputs.push(input);
      return {
        status: "COMPLETED",
        conversationId,
        message: "I found Products.",
        intentBrief: {
          goal: "Discover Products",
          constraints: emptyConversationContext().productConstraints,
          knownEntities: [],
          missingInformation: [],
          confidence: 0.9,
          requestedEffects: ["DISCOVER_PRODUCTS"],
        },
        products: [],
      };
    },
  };
  const POST = createPostHandler(async () => agent);
  const idempotencyKey = "61000000-0000-4000-8000-000000000001";

  const response = await postAgentMessage(POST, {
    idempotencyKey,
    message: "I want shoes",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(receivedInputs, [
    { idempotencyKey, message: "I want shoes" },
  ]);
});

test("returns the winning outcome when simultaneous duplicate turns race to insert", async () => {
  const idempotencyKey = "61000000-0000-4000-8000-000000000003";
  const originalOutcome: AgentOutcome = {
    status: "COMPLETED",
    conversationId,
    message: "Original outcome",
    intentBrief: {
      goal: "Discover Products",
      constraints: emptyConversationContext().productConstraints,
      knownEntities: [],
      missingInformation: [],
      confidence: 0.9,
      requestedEffects: ["DISCOVER_PRODUCTS"],
    },
    products: [],
  };
  let duplicateLookups = 0;
  let analyses = 0;
  const repository: ConversationRepository = {
    async findDuplicate() {
      duplicateLookups += 1;
      return duplicateLookups === 1 ? null : originalOutcome;
    },
    async create() {
      throw new Error("duplicate key value violates unique constraint");
    },
    async findOwnedContext() {
      return null;
    },
    async saveContextAndMetadata() {},
    async append() {
      throw new Error("not used");
    },
  };
  const POST = createConversationPost({
    repository,
    analyzer: {
      async analyze() {
        analyses += 1;
        throw new Error("must not reinterpret the duplicate");
      },
    },
    agentLoop: {
      async run() {
        throw new Error("must not run");
      },
    },
  });

  const response = await postAgentMessage(POST, {
    idempotencyKey,
    message: "I want shoes",
  });

  assert.deepEqual(await response.json(), { data: originalOutcome });
  assert.equal(duplicateLookups, 2);
  assert.equal(analyses, 0);
});

function catalogSearchFor(constraints: ShoppingIntent): CatalogSearch {
  return {
    productTypes: constraints.productTypes,
    useCases: constraints.useCases,
    features: constraints.features,
    inStockOnly: constraints.inStockOnly,
    attributes: constraints.attributes,
    ...(constraints.category === null
      ? {}
      : { category: constraints.category }),
    ...(constraints.minPriceMinor === null
      ? {}
      : { minPriceMinor: constraints.minPriceMinor }),
    ...(constraints.maxPriceMinor === null
      ? {}
      : { maxPriceMinor: constraints.maxPriceMinor }),
    ...(constraints.size === null ? {} : { size: constraints.size }),
    limit: 8,
  };
}

function createConversationPost({
  repository,
  analyzer,
  agentLoop,
  cart,
  catalog = {
    async search() {
      return { products: [] };
    },
    async getProduct() {
      throw new Error("not used");
    },
  },
}: {
  repository: ConversationRepository;
  analyzer: IntentAnalyzer;
  agentLoop: CommerceAgentLoop;
  cart?: Pick<CartModule, "inspect">;
  catalog?: ProductCatalog;
}) {
  const agent = createCommerceAgent(
    catalog,
    analyzer,
    createConversationModule(guestSessionId, repository),
    {
      agentLoop,
      ...(cart
        ? { cartInspection: createCartInspection(guestSessionId, () => cart) }
        : {}),
    },
  );
  return createPostHandler(async () => agent);
}

test("returns the Customer's active Cart in stable first-added order without repricing it", async () => {
  const repository = createInMemoryConversationRepository();
  const retainedCart = {
    id: "31000000-0000-4000-8000-000000000001",
    version: 2,
    items: [
      {
        productId: "21000000-0000-4000-8000-000000000002",
        productName: "TrailCrest Grip Running Shoes",
        quantity: 1,
        cartPriceMinor: 529900,
        subtotalMinor: 529900,
      },
      {
        productId: "21000000-0000-4000-8000-000000000001",
        productName: "StrideFlow Daily Running Shoes",
        quantity: 2,
        cartPriceMinor: 379900,
        subtotalMinor: 759800,
      },
    ],
    totalQuantity: 3,
    subtotalMinor: 1289700,
    currency: "INR",
  };
  const cart: Pick<CartModule, "inspect"> = {
    async inspect() {
      return structuredClone(retainedCart);
    },
  };
  const POST = createConversationPost({
    repository,
    analyzer: {
      async analyze() {
        return {
          goal: "Inspect Cart",
          constraintDelta: { set: {}, clear: [] },
          knownEntities: [],
          missingInformation: [],
          confidence: 0.99,
          requestedEffects: ["INSPECT_CART"],
        };
      },
    },
    catalog: {
      async search() {
        throw new Error("Cart inspection must not search the Catalog");
      },
      async getProduct() {
        throw new Error("Cart inspection must not reprice Cart Items");
      },
    },
    agentLoop: {
      async run() {
        throw new Error("Cart inspection must be authoritative");
      },
    },
    cart,
  });

  const first = await postAgentMessage(POST, { message: "What's in my Cart?" });
  const second = await postAgentMessage(POST, {
    message: "Show my Cart again",
  });

  assert.deepEqual(await first.json(), {
    data: {
      status: "COMPLETED",
      conversationId,
      message: "Here’s what’s in your Cart.",
      intentBrief: {
        goal: "Inspect Cart",
        constraints: emptyConversationContext().productConstraints,
        knownEntities: [],
        missingInformation: [],
        confidence: 0.99,
        requestedEffects: ["INSPECT_CART"],
      },
      products: [],
      cart: retainedCart,
    },
  });
  assert.deepEqual((await second.json()).data.cart, retainedCart);
});

test("returns a clear zero-quantity summary when the Customer's Cart is empty", async () => {
  const emptyCart = {
    id: null,
    version: 0,
    items: [],
    totalQuantity: 0,
    subtotalMinor: 0,
    currency: "INR",
  };
  const POST = createConversationPost({
    repository: createInMemoryConversationRepository(),
    analyzer: {
      async analyze() {
        return {
          goal: "Inspect Cart",
          constraintDelta: { set: {}, clear: [] },
          knownEntities: [],
          missingInformation: [],
          confidence: 0.99,
          requestedEffects: ["INSPECT_CART"],
        };
      },
    },
    agentLoop: {
      async run() {
        throw new Error("Cart inspection must be authoritative");
      },
    },
    cart: {
      async inspect() {
        return emptyCart;
      },
    },
  });

  const response = await postAgentMessage(POST, {
    message: "Is there anything in my Cart?",
  });

  const result = (await response.json()).data;
  assert.equal(result.message, "Your Cart is empty.");
  assert.deepEqual(result.cart, emptyCart);
});

test("carries Product constraints across Conversation Turns", async () => {
  const contextsSeenByAnalyzer: ConversationContext[] = [];
  const catalogSearches: unknown[] = [];
  const repository = createInMemoryConversationRepository();
  const analyses: Record<string, IntentAnalysis> = {
    "I want shoes": {
      goal: "Find shoes",
      constraintDelta: {
        set: { productTypes: ["shoes"] },
        clear: [],
      },
      knownEntities: [{ type: "PRODUCT_TYPE", value: "shoes" }],
      missingInformation: [],
      confidence: 0.95,
      requestedEffects: ["DISCOVER_PRODUCTS"],
    },
    "under 4000": {
      goal: "Refine Product discovery",
      constraintDelta: {
        set: { maxPriceMinor: 400000 },
        clear: [],
      },
      knownEntities: [],
      missingInformation: [],
      confidence: 0.95,
      requestedEffects: ["DISCOVER_PRODUCTS"],
    },
  };
  const analyzer: IntentAnalyzer = {
    async analyze({ context, message }) {
      contextsSeenByAnalyzer.push(context);
      return analyses[message];
    },
  };
  const agent = createCommerceAgent(
    {
      async search(input) {
        catalogSearches.push(input);
        return { products: [] };
      },
      async getProduct() {
        throw new Error("not used");
      },
    },
    analyzer,
    createConversationModule(guestSessionId, repository),
    {
      agentLoop: {
        async run({ capabilities }) {
          assert.ok(capabilities.searchProducts);
          await capabilities.searchProducts({
            query: "comfortable footwear",
            productTypes: ["sandals"],
            maxPriceMinor: 900000,
            limit: 8,
          });
          return {
            status: "COMPLETED",
            message: "I searched the Catalog.",
            productIds: [],
          };
        },
      },
    },
  );
  const POST = createPostHandler(async () => agent);

  const firstResponse = await postAgentMessage(POST, {
    message: "I want shoes",
  });
  const firstOutcome = await firstResponse.json();
  const secondResponse = await postAgentMessage(POST, {
    conversationId: firstOutcome.data.conversationId,
    message: "under 4000",
  });

  assert.equal(firstResponse.status, 200);
  assert.equal(secondResponse.status, 200);
  assert.equal(firstOutcome.data.conversationId, conversationId);
  assert.equal(
    (await secondResponse.json()).data.conversationId,
    conversationId,
  );
  assert.deepEqual(contextsSeenByAnalyzer, [
    emptyConversationContext(),
    {
      ...emptyConversationContext(),
      revision: 1,
      productConstraints: {
        ...emptyConversationContext().productConstraints,
        productTypes: ["shoes"],
      },
    },
  ]);
  assert.deepEqual(catalogSearches.at(-1), {
    query: "comfortable footwear",
    productTypes: ["shoes"],
    inStockOnly: true,
    maxPriceMinor: 400000,
    limit: 8,
  });
});

test("does not mutate Conversation Context when intent interpretation fails", async () => {
  const contextsSeenByAnalyzer: ConversationContext[] = [];
  const repository = createInMemoryConversationRepository();
  const analyzer: IntentAnalyzer = {
    async analyze({ context, message }) {
      contextsSeenByAnalyzer.push(context);
      if (message === "try again") throw new Error("model unavailable");
      return {
        goal: message === "I want shoes" ? "Find shoes" : "Set a budget",
        constraintDelta: {
          set:
            message === "I want shoes"
              ? { productTypes: ["shoes"] }
              : { maxPriceMinor: 400000 },
          clear: [],
        },
        knownEntities: [],
        missingInformation: [],
        confidence: 0.9,
        requestedEffects: ["DISCOVER_PRODUCTS"],
      };
    },
  };
  const POST = createConversationPost({
    repository,
    analyzer,
    agentLoop: {
      async run() {
        return {
          status: "COMPLETED",
          message: "I searched the Catalog.",
          productIds: [],
        };
      },
    },
  });

  const first = await postAgentMessage(POST, { message: "I want shoes" });
  const id = (await first.json()).data.conversationId;
  const failed = await postAgentMessage(POST, {
    conversationId: id,
    message: "try again",
  });
  await postAgentMessage(POST, {
    conversationId: id,
    message: "under 4000",
  });

  assert.equal((await failed.json()).data.status, "TEMPORARILY_UNAVAILABLE");
  assert.deepEqual(contextsSeenByAnalyzer[2], contextsSeenByAnalyzer[1]);
  assert.equal(contextsSeenByAnalyzer[2].revision, 1);
  assert.deepEqual(contextsSeenByAnalyzer[2].productConstraints.productTypes, [
    "shoes",
  ]);
});

test("keeps an interpreted preference when later Product discovery fails", async () => {
  const contextsSeenByAnalyzer: ConversationContext[] = [];
  const repository = createInMemoryConversationRepository();
  let discoveryAttempts = 0;
  const POST = createConversationPost({
    repository,
    analyzer: {
      async analyze({ context, message }) {
        contextsSeenByAnalyzer.push(context);
        return {
          goal: "Refine Product discovery",
          constraintDelta: {
            set:
              message === "I want shoes"
                ? { productTypes: ["shoes"] }
                : message === "under 4000"
                  ? { maxPriceMinor: 400000 }
                  : {},
            clear: [],
          },
          knownEntities: [],
          missingInformation: [],
          confidence: 0.9,
          requestedEffects: ["DISCOVER_PRODUCTS"],
        };
      },
    },
    agentLoop: {
      async run() {
        discoveryAttempts += 1;
        if (discoveryAttempts === 2) throw new Error("Catalog unavailable");
        return {
          status: "COMPLETED",
          message: "I searched the Catalog.",
          productIds: [],
        };
      },
    },
  });

  const first = await postAgentMessage(POST, { message: "I want shoes" });
  const id = (await first.json()).data.conversationId;
  const failed = await postAgentMessage(POST, {
    conversationId: id,
    message: "under 4000",
  });
  await postAgentMessage(POST, {
    conversationId: id,
    message: "show them again",
  });

  const failedTurn = (await failed.json()).data;
  assert.equal(failedTurn.status, "COMPLETED");
  assert.deepEqual(failedTurn.products, []);
  assert.equal(contextsSeenByAnalyzer[2].revision, 2);
  assert.deepEqual(contextsSeenByAnalyzer[2].productConstraints, {
    ...emptyConversationContext().productConstraints,
    productTypes: ["shoes"],
    maxPriceMinor: 400000,
  });
});

test("applies a typed clear operation without losing other Product constraints", async () => {
  const catalogSearches: CatalogSearch[] = [];
  const repository = createInMemoryConversationRepository();
  const POST = createConversationPost({
    repository,
    analyzer: {
      async analyze({ message }) {
        return {
          goal: "Refine Product discovery",
          constraintDelta:
            message === "shoes under 4000"
              ? {
                  set: {
                    productTypes: ["shoes"],
                    maxPriceMinor: 400000,
                  },
                  clear: [],
                }
              : { set: {}, clear: ["maxPriceMinor"] },
          knownEntities: [],
          missingInformation: [],
          confidence: 0.9,
          requestedEffects: ["DISCOVER_PRODUCTS"],
        };
      },
    },
    catalog: {
      async search(input) {
        catalogSearches.push(input);
        return { products: [] };
      },
      async getProduct() {
        throw new Error("not used");
      },
    },
    agentLoop: {
      async run({ intentBrief, capabilities }) {
        assert.ok(capabilities.searchProducts);
        await capabilities.searchProducts(
          catalogSearchFor(intentBrief.constraints),
        );
        return {
          status: "COMPLETED",
          message: "I searched the Catalog.",
          productIds: [],
        };
      },
    },
  });

  const first = await postAgentMessage(POST, {
    message: "shoes under 4000",
  });
  await postAgentMessage(POST, {
    conversationId: (await first.json()).data.conversationId,
    message: "remove the budget",
  });

  assert.deepEqual(catalogSearches.at(-1), {
    productTypes: ["shoes"],
    useCases: [],
    features: [],
    inStockOnly: true,
    attributes: {},
    limit: 8,
  });
});

test("replaces a Product type while preserving budget and removing stale Product details", async () => {
  const catalogSearches: CatalogSearch[] = [];
  const repository = createInMemoryConversationRepository();
  const POST = createConversationPost({
    repository,
    analyzer: {
      async analyze({ message }) {
        return {
          goal: "Discover Products",
          constraintDelta:
            message === "shoes in UK 9 under 4000"
              ? {
                  set: {
                    productTypes: ["shoes"],
                    maxPriceMinor: 400000,
                    size: "UK 9",
                    features: ["waterproof", "lace-up"],
                    attributes: {
                      closureType: "lace-up",
                      impedance: 32,
                      sole: "rubber",
                    },
                  },
                  clear: [],
                }
              : {
                  set: { productTypes: ["shirts"] },
                  clear: [],
                },
          knownEntities: [],
          missingInformation: [],
          confidence: 0.9,
          requestedEffects: ["DISCOVER_PRODUCTS"],
        };
      },
    },
    catalog: {
      async search(input) {
        catalogSearches.push(input);
        return { products: [] };
      },
      async getProduct() {
        throw new Error("not used");
      },
    },
    agentLoop: {
      async run({ intentBrief, capabilities }) {
        assert.ok(capabilities.searchProducts);
        await capabilities.searchProducts(
          catalogSearchFor(intentBrief.constraints),
        );
        return { status: "COMPLETED", message: "Done", productIds: [] };
      },
    },
  });

  const first = await postAgentMessage(POST, {
    message: "shoes in UK 9 under 4000",
  });
  await postAgentMessage(POST, {
    conversationId: (await first.json()).data.conversationId,
    message: "actually, show me shirts",
  });

  assert.deepEqual(catalogSearches.at(-1), {
    productTypes: ["shirts"],
    useCases: [],
    features: ["waterproof"],
    inStockOnly: true,
    attributes: {},
    maxPriceMinor: 400000,
    limit: 8,
  });
});

test("reinterprets once when a concurrent turn changes Conversation Context", async () => {
  const initialContext = emptyConversationContext();
  const concurrentContext: ConversationContext = {
    ...initialContext,
    revision: 1,
    productConstraints: {
      ...initialContext.productConstraints,
      size: "UK 9",
    },
  };
  let persistedContext = initialContext;
  let saves = 0;
  const contextsSeenByAnalyzer: ConversationContext[] = [];
  const catalogSearches: CatalogSearch[] = [];
  const repository: ConversationRepository = {
    async findDuplicate() {
      return null;
    },
    async create() {
      return {
        conversationId,
        customerMessageId: "51000000-0000-4000-8000-000000000001",
        context: initialContext,
      };
    },
    async findOwnedContext() {
      return { guestSessionId, context: persistedContext };
    },
    async saveContextAndMetadata(_id, context) {
      saves += 1;
      if (saves === 1) {
        persistedContext = concurrentContext;
        return false as never;
      }
      persistedContext = context;
      return true as never;
    },
    async append() {
      return "51000000-0000-4000-8000-000000000002";
    },
  };
  const POST = createConversationPost({
    repository,
    analyzer: {
      async analyze({ context }) {
        contextsSeenByAnalyzer.push(context);
        return {
          goal: "Find shoes",
          constraintDelta: {
            set: { productTypes: ["shoes"] },
            clear: [],
          },
          knownEntities: [],
          missingInformation: [],
          confidence: 0.9,
          requestedEffects: ["DISCOVER_PRODUCTS"],
        };
      },
    },
    catalog: {
      async search(input) {
        catalogSearches.push(input);
        return { products: [] };
      },
      async getProduct() {
        throw new Error("not used");
      },
    },
    agentLoop: {
      async run({ capabilities }) {
        assert.ok(capabilities.searchProducts);
        await capabilities.searchProducts({ limit: 8 });
        return {
          status: "COMPLETED",
          message: "I searched the Catalog.",
          productIds: [],
        };
      },
    },
  });

  const response = await postAgentMessage(POST, { message: "I want shoes" });

  assert.equal(response.status, 200);
  assert.equal(saves, 2);
  assert.deepEqual(contextsSeenByAnalyzer, [initialContext, concurrentContext]);
  assert.notEqual(catalogSearches.length, 0);
  for (const search of catalogSearches) {
    assert.deepEqual(search, {
      productTypes: ["shoes"],
      size: "UK 9",
      inStockOnly: true,
      limit: 8,
    });
  }
});

test("returns a retryable response after a second Conversation Context conflict", async () => {
  let persistedContext = emptyConversationContext();
  let saves = 0;
  let discoveryStarted = false;
  const repository: ConversationRepository = {
    async findDuplicate() {
      return null;
    },
    async create() {
      return {
        conversationId,
        customerMessageId: "51000000-0000-4000-8000-000000000001",
        context: persistedContext,
      };
    },
    async findOwnedContext() {
      return { guestSessionId, context: persistedContext };
    },
    async saveContextAndMetadata() {
      saves += 1;
      persistedContext = {
        ...persistedContext,
        revision: persistedContext.revision + 1,
        productConstraints: {
          ...persistedContext.productConstraints,
          size: saves === 1 ? "UK 9" : "UK 10",
        },
      };
      return false;
    },
    async append() {
      return "51000000-0000-4000-8000-000000000002";
    },
  };
  const POST = createConversationPost({
    repository,
    analyzer: {
      async analyze() {
        return {
          goal: "Find shoes",
          constraintDelta: {
            set: { productTypes: ["shoes"] },
            clear: [],
          },
          knownEntities: [],
          missingInformation: [],
          confidence: 0.9,
          requestedEffects: ["DISCOVER_PRODUCTS"],
        };
      },
    },
    agentLoop: {
      async run() {
        discoveryStarted = true;
        return {
          status: "COMPLETED",
          message: "This must not be reached.",
          productIds: [],
        };
      },
    },
  });

  const response = await postAgentMessage(POST, { message: "I want shoes" });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    data: {
      status: "TEMPORARILY_UNAVAILABLE",
      conversationId,
      message: "That conversation changed. Please retry your request.",
      retryable: true,
      products: [],
    },
  });
  assert.equal(saves, 2);
  assert.equal(discoveryStarted, false);
});

test("accepts a Customer prompt without exposing client Brand selection to the agent", async () => {
  const messages: string[] = [];
  const agent: CommerceAgent = {
    async respond(input) {
      messages.push(input.message);
      return {
        status: "COMPLETED",
        conversationId: "41000000-0000-4000-8000-000000000001",
        message: "I found products matching your request.",
        intentBrief: {
          goal: "Find headphones",
          constraints: {
            productTypes: ["headphones"],
            useCases: [],
            features: [],
            category: "Audio",
            minPriceMinor: null,
            maxPriceMinor: null,
            size: null,
            inStockOnly: true,
            attributes: {},
          },
          knownEntities: [{ type: "PRODUCT_TYPE", value: "headphones" }],
          missingInformation: [],
          confidence: 0.9,
          requestedEffects: ["DISCOVER_PRODUCTS"],
        },
        products: [],
      };
    },
  };
  const POST = createPostHandler(async () => agent);

  const response = await POST(
    new Request("http://localhost/api/agent/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        brandId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        idempotencyKey: "61000000-0000-4000-8000-000000000010",
        message: "show me products",
      }),
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(messages, ["show me products"]);
  assert.deepEqual(await response.json(), {
    data: {
      status: "COMPLETED",
      conversationId: "41000000-0000-4000-8000-000000000001",
      message: "I found products matching your request.",
      intentBrief: {
        goal: "Find headphones",
        constraints: {
          productTypes: ["headphones"],
          useCases: [],
          features: [],
          category: "Audio",
          minPriceMinor: null,
          maxPriceMinor: null,
          size: null,
          inStockOnly: true,
          attributes: {},
        },
        knownEntities: [{ type: "PRODUCT_TYPE", value: "headphones" }],
        missingInformation: [],
        confidence: 0.9,
        requestedEffects: ["DISCOVER_PRODUCTS"],
      },
      products: [],
    },
  });
});

test("rejects an empty Customer prompt before creating an agent", async () => {
  let agentCreated = false;
  const POST = createPostHandler(async () => {
    agentCreated = true;
    throw new Error("The agent should not be created");
  });

  const response = await POST(
    new Request("http://localhost/api/agent/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "   " }),
    }),
  );

  assert.equal(response.status, 400);
  assert.equal(agentCreated, false);
  assert.deepEqual(await response.json(), {
    error: {
      code: "INVALID_MESSAGE",
      message: "message cannot be empty.",
      details: { field: "message" },
    },
  });
});

test("requires a client-generated Conversation Turn idempotency key", async () => {
  let agentCreated = false;
  const POST = createPostHandler(async () => {
    agentCreated = true;
    throw new Error("The agent should not be created");
  });

  const response = await POST(
    new Request("http://localhost/api/agent/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "show me shoes" }),
    }),
  );

  assert.equal(response.status, 400);
  assert.equal(agentCreated, false);
  assert.deepEqual(await response.json(), {
    error: {
      code: "INVALID_IDEMPOTENCY_KEY",
      message: "idempotencyKey must be a UUID.",
      details: { field: "idempotencyKey" },
    },
  });
});

test("rejects legacy runtime identity fields before creating an agent", async () => {
  let agentCreated = false;
  const POST = createPostHandler(async () => {
    agentCreated = true;
    throw new Error("The agent should not be created");
  });

  for (const field of [
    "userId",
    "customerId",
    "adminId",
    "user_id",
    "customer_id",
    "admin_id",
    "userIdentifier",
    "customerIdentifier",
    "adminIdentifier",
    "brandAdminId",
    "brand_admin_id",
    "brandAdminIdentifier",
  ] as const) {
    const response = await POST(
      new Request("http://localhost/api/agent/message", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          message: "show me shoes",
          [field]: crypto.randomUUID(),
        }),
      }),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: {
        code: "INVALID_IDENTITY_FIELD",
        message: "Runtime identity fields are not accepted.",
        details: { field },
      },
    });
  }
  assert.equal(agentCreated, false);
});

test("passes a conversation identifier to the Commerce Agent", async () => {
  const receivedInputs: Array<{
    conversationId?: string;
    idempotencyKey: string;
    message: string;
  }> = [];
  const agent: CommerceAgent = {
    async respond(input) {
      receivedInputs.push(input);
      return {
        status: "COMPLETED",
        conversationId: "41000000-0000-4000-8000-000000000001",
        message: "I found products matching your refinement.",
        intentBrief: {
          goal: "Refine Product discovery",
          constraints: {
            productTypes: [],
            useCases: [],
            features: ["waterproof"],
            category: null,
            minPriceMinor: null,
            maxPriceMinor: null,
            size: null,
            inStockOnly: true,
            attributes: {},
          },
          knownEntities: [],
          missingInformation: [],
          confidence: 0.8,
          requestedEffects: ["DISCOVER_PRODUCTS"],
        },
        products: [],
      };
    },
  };
  const POST = createPostHandler(async () => agent);

  const response = await POST(
    new Request("http://localhost/api/agent/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: "41000000-0000-4000-8000-000000000001",
        idempotencyKey: "61000000-0000-4000-8000-000000000011",
        message: "only the waterproof ones",
      }),
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(receivedInputs, [
    {
      conversationId: "41000000-0000-4000-8000-000000000001",
      idempotencyKey: "61000000-0000-4000-8000-000000000011",
      message: "only the waterproof ones",
    },
  ]);
});

test("rejects a Conversation outside the current Guest Session's ownership", async () => {
  const agent: CommerceAgent = {
    async respond() {
      throw new ConversationAccessError();
    },
  };
  const POST = createPostHandler(async () => agent);

  const response = await POST(
    new Request("http://localhost/api/agent/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: "41000000-0000-4000-8000-000000000099",
        idempotencyKey: "61000000-0000-4000-8000-000000000012",
        message: "show me more like those",
      }),
    }),
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: {
      code: "CONVERSATION_NOT_FOUND",
      message: "The conversation was not found.",
      details: {},
    },
  });
});

test("rejects a malformed conversation identifier before creating an agent", async () => {
  let agentCreated = false;
  const POST = createPostHandler(async () => {
    agentCreated = true;
    throw new Error("The agent should not be created");
  });

  const response = await POST(
    new Request("http://localhost/api/agent/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: "not-a-conversation-id",
        message: "show me more",
      }),
    }),
  );

  assert.equal(response.status, 400);
  assert.equal(agentCreated, false);
  assert.deepEqual(await response.json(), {
    error: {
      code: "INVALID_CONVERSATION_ID",
      message: "conversationId must be a UUID.",
      details: { field: "conversationId" },
    },
  });
});
