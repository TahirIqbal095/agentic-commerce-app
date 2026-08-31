import assert from "node:assert/strict";
import test from "node:test";
import {
  createCommerceAgent,
  type CommerceAgent,
  type CommerceAgentLoop,
} from "@/modules/agent/commerce-agent";
import type { CatalogModule } from "@/modules/catalog/catalog";
import {
  CartError,
  type CartModule,
  type CartView,
} from "@/modules/cart/cart";
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

const conversationId = "41000000-0000-4000-8000-000000000001";
const userId = "11000000-0000-4000-8000-000000000001";

function createInMemoryConversationRepository(): ConversationRepository {
  let persistedContext: ConversationContext | undefined;
  return {
    async findDuplicate() { return null; },
    async create() {
      persistedContext = emptyConversationContext();
      return {
        conversationId,
        userMessageId: "51000000-0000-4000-8000-000000000001",
        context: persistedContext,
      };
    },
    async findOwnedContext() {
      return persistedContext ? { userId, context: persistedContext } : null;
    },
    async saveContextAndMetadata(_conversationId, context) {
      persistedContext = context;
    },
    async saveRecommendationSet(_conversationId, expectedRevision, recommendations) {
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
      async search() { return { products }; },
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

test("does not duplicate a multi-Product addition when a Conversation Turn is delivered twice", async () => {
  const idempotencyKey = "61000000-0000-4000-8000-000000000002";
  const products = [
    {
      id: "71000000-0000-4000-8000-000000000002",
      slug: "road-two",
      name: "Road Two",
      description: "A light road shoe",
      category: "Footwear",
      priceMinor: 410000,
      currency: "INR",
      inStock: true,
      attributes: {},
    },
    {
      id: "71000000-0000-4000-8000-000000000003",
      slug: "court-three",
      name: "Court Three",
      description: "A durable court shoe",
      category: "Footwear",
      priceMinor: 280000,
      currency: "INR",
      inStock: true,
      attributes: {},
    },
  ];
  const context = {
    ...emptyConversationContext(),
    latestRecommendationSet: products.map((product) => ({
      productId: product.id,
      name: product.name,
      description: product.description,
      category: product.category,
    })),
  };
  let storedOutcome: AgentOutcome | null = null;
  let analyses = 0;
  let additions = 0;
  let userMessages = 0;
  const repository: ConversationRepository = {
    async findDuplicate(_owner, _conversationId, key) {
      return key === idempotencyKey ? storedOutcome : null;
    },
    async create() {
      userMessages += 1;
      return {
        conversationId,
        userMessageId: "51000000-0000-4000-8000-000000000001",
        context,
      };
    },
    async findOwnedContext() {
      return { userId, context };
    },
    async saveContextAndMetadata() {},
    async append() {
      userMessages += 1;
      return "51000000-0000-4000-8000-000000000002";
    },
    async finalizeTurn(_conversationId, _messageId, _message, outcome) {
      storedOutcome = outcome;
    },
  };
  const POST = createConversationPost({
    repository,
    analyzer: {
      async analyze() {
        analyses += 1;
        return {
          goal: "Add two recommended Products",
          constraintDelta: { set: {}, clear: [] },
          knownEntities: [],
          missingInformation: [],
          confidence: 0.9,
          requestedEffects: ["ADD_TO_CART"],
          referencedProductIds: products.map((product) => product.id),
        };
      },
    },
    catalog: {
      async search() { throw new Error("not used"); },
      async getProduct(productId) {
        const product = products.find((candidate) => candidate.id === productId);
        assert.ok(product);
        return { ok: true, value: product };
      },
    },
    agentLoop: { async run() { throw new Error("not used"); } },
    cart: {
      async addItem() {
        throw new Error("Multi-Product additions must be atomic");
      },
      async addItems() {
        additions += 1;
        return {
          id: "31000000-0000-4000-8000-000000000002",
          items: products.map((product) => ({
            productId: product.id,
            productName: product.name,
            quantity: 1,
            cartPriceMinor: product.priceMinor,
            subtotalMinor: product.priceMinor,
          })),
          totalQuantity: 2,
          subtotalMinor: 690000,
          currency: "INR",
        };
      },
      async inspect() { throw new Error("not used"); },
    },
  });
  const request = { idempotencyKey, message: "Add the first and second" };

  const first = await postAgentMessage(POST, request);
  const second = await postAgentMessage(POST, request);

  assert.deepEqual(await second.json(), await first.json());
  assert.equal(additions, 1);
  assert.equal(analyses, 1);
  assert.equal(userMessages, 1);
});

test("retains every addition from distinct concurrent multi-Product turns", async () => {
  const products = [
    {
      id: "71000000-0000-4000-8000-000000000041",
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
      id: "71000000-0000-4000-8000-000000000042",
      slug: "court-two",
      name: "Court Two",
      description: "A durable court shoe",
      category: "Footwear",
      priceMinor: 280000,
      currency: "INR",
      inStock: true,
      attributes: {},
    },
  ];
  const context = {
    ...emptyConversationContext(),
    latestRecommendationSet: products.map((product) => ({
      productId: product.id,
      name: product.name,
      description: product.description,
      category: product.category,
    })),
  };
  let messageNumber = 0;
  const repository: ConversationRepository = {
    async findDuplicate() { return null; },
    async create() {
      throw new Error("Concurrent turns continue an existing Conversation");
    },
    async findOwnedContext() { return { userId, context }; },
    async saveContextAndMetadata() {},
    async append() {
      messageNumber += 1;
      return `51000000-0000-4000-8000-${String(messageNumber).padStart(12, "0")}`;
    },
    async finalizeTurn() {},
  };
  const quantities = new Map(products.map((product) => [product.id, 0]));
  let mutationQueue = Promise.resolve();
  const cartView = () => {
    const items = products.flatMap((product) => {
      const quantity = quantities.get(product.id) ?? 0;
      return quantity === 0
        ? []
        : [{
            productId: product.id,
            productName: product.name,
            quantity,
            cartPriceMinor: product.priceMinor,
            subtotalMinor: product.priceMinor * quantity,
          }];
    });
    return {
      id: items.length > 0
        ? "31000000-0000-4000-8000-000000000041"
        : null,
      items,
      totalQuantity: items.reduce((total, item) => total + item.quantity, 0),
      subtotalMinor: items.reduce(
        (total, item) => total + item.subtotalMinor,
        0,
      ),
      currency: "INR",
    };
  };
  const cart = {
    async addItem() {
      throw new Error("Concurrent turns use multi-Product additions");
    },
    async addItems(
      additions: Array<{
        product: (typeof products)[number];
        quantity: number;
      }>,
      complete: (cart: ReturnType<typeof cartView>, transaction: never) => Promise<void>,
    ) {
      const precedingMutation = mutationQueue;
      let releaseMutation!: () => void;
      mutationQueue = new Promise<void>((resolve) => {
        releaseMutation = resolve;
      });
      await precedingMutation;
      try {
        for (const addition of additions) {
          quantities.set(
            addition.product.id,
            (quantities.get(addition.product.id) ?? 0) + addition.quantity,
          );
        }
        const updatedCart = cartView();
        await complete(updatedCart, {} as never);
        return updatedCart;
      } finally {
        releaseMutation();
      }
    },
    async inspect() { return cartView(); },
  };
  const POST = createConversationPost({
    repository,
    analyzer: {
      async analyze({ message }) {
        if (message === "What's in my Cart?") {
          return {
            goal: "Inspect Cart",
            constraintDelta: { set: {}, clear: [] },
            knownEntities: [],
            missingInformation: [],
            confidence: 0.99,
            requestedEffects: ["INSPECT_CART"],
          };
        }
        const quantity = message.includes("two of each") ? 2 : 1;
        return {
          goal: "Add two Products",
          constraintDelta: { set: {}, clear: [] },
          knownEntities: [],
          missingInformation: [],
          confidence: 0.99,
          requestedEffects: ["ADD_TO_CART"],
          referencedProductIds: products.map((product) => product.id),
          requestedQuantity: quantity,
        };
      },
    },
    catalog: {
      async search() { throw new Error("not used"); },
      async getProduct(productId) {
        const product = products.find((candidate) => candidate.id === productId);
        assert.ok(product);
        return { ok: true, value: product };
      },
    },
    agentLoop: { async run() { throw new Error("not used"); } },
    cart,
  });

  const responses = await Promise.all([
    postAgentMessage(POST, {
      conversationId,
      message: "Add the first and second",
    }),
    postAgentMessage(POST, {
      conversationId,
      message: "Add the first and second, two of each",
    }),
  ]);
  const inspection = await postAgentMessage(POST, {
    conversationId,
    message: "What's in my Cart?",
  });

  assert.deepEqual(
    await Promise.all(responses.map(async (response) => (await response.json()).data.status)),
    ["COMPLETED", "COMPLETED"],
  );
  assert.deepEqual((await inspection.json()).data.cart, {
    id: "31000000-0000-4000-8000-000000000041",
    items: [
      {
        productId: products[0].id,
        productName: "Trail One",
        quantity: 3,
        cartPriceMinor: 350000,
        subtotalMinor: 1050000,
      },
      {
        productId: products[1].id,
        productName: "Court Two",
        quantity: 3,
        cartPriceMinor: 280000,
        subtotalMinor: 840000,
      },
    ],
    totalQuantity: 6,
    subtotalMinor: 1890000,
    currency: "INR",
  });
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
    async findOwnedContext() { return null; },
    async saveContextAndMetadata() {},
    async append() { throw new Error("not used"); },
  };
  const POST = createConversationPost({
    repository,
    analyzer: {
      async analyze() {
        analyses += 1;
        throw new Error("must not reinterpret the duplicate");
      },
    },
    agentLoop: { async run() { throw new Error("must not run"); } },
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
    async search() { return { products: [] }; },
    async getProduct() { throw new Error("not used"); },
  },
}: {
  repository: ConversationRepository;
  analyzer: IntentAnalyzer;
  agentLoop: CommerceAgentLoop;
  cart?: CartModule;
  catalog?: CatalogModule;
}) {
  const agent = createCommerceAgent(
    catalog,
    analyzer,
    createConversationModule(userId, repository),
    { agentLoop, cart },
  );
  return createPostHandler(async () => agent);
}

test("returns the Customer's active Cart in stable first-added order without repricing it", async () => {
  const repository = createInMemoryConversationRepository();
  const retainedCart = {
    id: "31000000-0000-4000-8000-000000000001",
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
  const cart: CartModule = {
    async addItem() {
      throw new Error("Cart inspection must not mutate the Cart");
    },
    async inspect() { return structuredClone(retainedCart); },
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
      async run() { throw new Error("Cart inspection must be authoritative"); },
    },
    cart,
  });

  const first = await postAgentMessage(POST, { message: "What's in my Cart?" });
  const second = await postAgentMessage(POST, { message: "Show my Cart again" });

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
      async run() { throw new Error("Cart inspection must be authoritative"); },
    },
    cart: {
      async addItem() {
        throw new Error("Cart inspection must not mutate the Cart");
      },
      async inspect() { return emptyCart; },
    },
  });

  const response = await postAgentMessage(POST, {
    message: "Is there anything in my Cart?",
  });

  const result = (await response.json()).data;
  assert.equal(result.message, "Your Cart is empty.");
  assert.deepEqual(result.cart, emptyCart);
});

test("adds the second Product from the latest Recommendation Set with a default quantity of one", async () => {
  const repository = createInMemoryConversationRepository();
  const products = [
    {
      id: "71000000-0000-4000-8000-000000000011",
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
      id: "71000000-0000-4000-8000-000000000012",
      slug: "road-two",
      name: "Road Two",
      description: "A light road shoe",
      category: "Footwear",
      priceMinor: 390000,
      currency: "INR",
      inStock: true,
      attributes: {},
    },
  ];
  const currentProduct = { ...products[1], priceMinor: 410000 };
  const updatedCart = {
    id: "31000000-0000-4000-8000-000000000011",
    items: [
      {
        productId: currentProduct.id,
        productName: currentProduct.name,
        quantity: 2,
        cartPriceMinor: currentProduct.priceMinor,
        subtotalMinor: 2 * currentProduct.priceMinor,
      },
    ],
    totalQuantity: 2,
    subtotalMinor: 2 * currentProduct.priceMinor,
    currency: "INR",
    priceChange: {
      productId: currentProduct.id,
      previousCartPriceMinor: 390000,
      currentCartPriceMinor: currentProduct.priceMinor,
    },
  };
  const additions: Array<{ productId: string; priceMinor: number; quantity: number }> = [];
  let turn = 0;
  const POST = createConversationPost({
    repository,
    analyzer: {
      async analyze({ context }) {
        return context.latestRecommendationSet.length === 0
          ? {
              goal: "Discover Products",
              constraintDelta: { set: {}, clear: [] },
              knownEntities: [],
              missingInformation: [],
              confidence: 0.99,
              requestedEffects: ["DISCOVER_PRODUCTS"],
            }
          : {
              goal: "Add a recommended Product",
              constraintDelta: { set: {}, clear: [] },
              knownEntities: [],
              missingInformation: [],
              confidence: 0.99,
              requestedEffects: ["ADD_TO_CART"],
              referencedProductIds: [context.latestRecommendationSet[1].productId],
            };
      },
    },
    catalog: {
      async search() { return { products }; },
      async getProduct(productId) {
        assert.equal(productId, currentProduct.id);
        return { ok: true, value: currentProduct };
      },
    },
    agentLoop: {
      async run({ capabilities }) {
        turn += 1;
        if (turn > 1) throw new Error("Cart additions must not use the model loop");
        assert.ok(capabilities.searchProducts);
        await capabilities.searchProducts({ limit: 8 });
        return {
          status: "COMPLETED",
          message: "Two Recommendations.",
          productIds: products.map((product) => product.id),
        };
      },
    },
    cart: {
      async addItem(product, quantity) {
        additions.push({ productId: product.id, priceMinor: product.priceMinor, quantity });
        return updatedCart;
      },
      async inspect() { return updatedCart; },
    },
  });

  const discovery = await postAgentMessage(POST, { message: "Show me shoes" });
  const addition = await postAgentMessage(POST, {
    conversationId: (await discovery.json()).data.conversationId,
    message: "Add the second one",
  });

  assert.deepEqual(additions, [
    { productId: currentProduct.id, priceMinor: currentProduct.priceMinor, quantity: 1 },
  ]);
  assert.deepEqual((await addition.json()).data, {
    status: "COMPLETED",
    conversationId,
    message:
      "Added 1 × Road Two to your Cart. Its Cart Price changed from ₹3,900.00 to ₹4,100.00.",
    intentBrief: {
      goal: "Add a recommended Product",
      constraints: emptyConversationContext().productConstraints,
      knownEntities: [],
      missingInformation: [],
      confidence: 0.99,
      requestedEffects: ["ADD_TO_CART"],
      referencedProductIds: [currentProduct.id],
    },
    products: [],
    cart: updatedCart,
  });

});

test("adds different quantities of multiple identified Products in one Conversation Turn", async () => {
  const products = [
    {
      id: "71000000-0000-4000-8000-000000000021",
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
      id: "71000000-0000-4000-8000-000000000022",
      slug: "road-two",
      name: "Road Two",
      description: "A light road shoe",
      category: "Footwear",
      priceMinor: 410000,
      currency: "INR",
      inStock: true,
      attributes: {},
    },
    {
      id: "71000000-0000-4000-8000-000000000023",
      slug: "court-three",
      name: "Court Three",
      description: "A durable court shoe",
      category: "Footwear",
      priceMinor: 280000,
      currency: "INR",
      inStock: true,
      attributes: {},
    },
  ];
  const context = {
    ...emptyConversationContext(),
    latestRecommendationSet: products.map((product) => ({
      productId: product.id,
      name: product.name,
      description: product.description,
      category: product.category,
    })),
  };
  const selectedProducts: typeof products = [];
  const addProducts = (additions: Array<{
    product: (typeof products)[number];
    quantity: number;
  }>) => {
    selectedProducts.push(...additions.map(({ product }) => product));
    const items = additions.map(({ product, quantity }) => ({
      productId: product.id,
      productName: product.name,
      quantity,
      cartPriceMinor: product.priceMinor,
      subtotalMinor: product.priceMinor * quantity,
    }));
    return {
      id: "31000000-0000-4000-8000-000000000021",
      items,
      totalQuantity: 3,
      subtotalMinor: 980000,
      currency: "INR",
    };
  };
  const POST = createConversationPost({
    repository: {
      async findDuplicate() { return null; },
      async create() {
        return {
          conversationId,
          userMessageId: "51000000-0000-4000-8000-000000000021",
          context,
        };
      },
      async findOwnedContext() { return { userId, context }; },
      async saveContextAndMetadata() {},
      async append() { return "51000000-0000-4000-8000-000000000022"; },
    },
    analyzer: {
      async analyze() {
        return {
          goal: "Add two of the first Product and one of the third",
          constraintDelta: { set: {}, clear: [] },
          knownEntities: [],
          missingInformation: [],
          confidence: 0.99,
          requestedEffects: ["ADD_TO_CART"],
          referencedProductIds: [products[0].id, products[2].id],
          requestedCartItems: [
            { productId: products[0].id, quantity: 2 },
            { productId: products[2].id, quantity: 1 },
          ],
        };
      },
    },
    catalog: {
      async search() { throw new Error("not used"); },
      async getProduct(productId) {
        const product = products.find((candidate) => candidate.id === productId);
        assert.ok(product);
        return { ok: true, value: product };
      },
    },
    agentLoop: { async run() { throw new Error("not used"); } },
    cart: {
      async addItem(product, quantity) {
        return addProducts([{ product, quantity }]);
      },
      async addItems(additions) { return addProducts(additions); },
      async inspect() { throw new Error("not used"); },
    },
  });

  const response = await postAgentMessage(POST, {
    message: "Add two of the first and one of the third",
  });

  assert.deepEqual((await response.json()).data, {
    status: "COMPLETED",
    conversationId,
    message: "Added 2 × Trail One and 1 × Court Three to your Cart.",
    intentBrief: {
      goal: "Add two of the first Product and one of the third",
      constraints: emptyConversationContext().productConstraints,
      knownEntities: [],
      missingInformation: [],
      confidence: 0.99,
      requestedEffects: ["ADD_TO_CART"],
      referencedProductIds: [products[0].id, products[2].id],
      requestedCartItems: [
        { productId: products[0].id, quantity: 2 },
        { productId: products[2].id, quantity: 1 },
      ],
    },
    products: [],
    cart: {
      id: "31000000-0000-4000-8000-000000000021",
      items: [
        {
          productId: products[0].id,
          productName: "Trail One",
          quantity: 2,
          cartPriceMinor: 350000,
          subtotalMinor: 700000,
        },
        {
          productId: products[2].id,
          productName: "Court Three",
          quantity: 1,
          cartPriceMinor: 280000,
          subtotalMinor: 280000,
        },
      ],
      totalQuantity: 3,
      subtotalMinor: 980000,
      currency: "INR",
    },
  });
});

test("returns the unchanged Cart when any Product in a multi-Product addition fails", async () => {
  const products = [
    {
      id: "71000000-0000-4000-8000-000000000031",
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
      id: "71000000-0000-4000-8000-000000000033",
      slug: "court-three",
      name: "Court Three",
      description: "A low-stock court shoe",
      category: "Footwear",
      priceMinor: 280000,
      currency: "INR",
      inStock: true,
      attributes: {},
    },
  ];
  const context = {
    ...emptyConversationContext(),
    latestRecommendationSet: products.map((product) => ({
      productId: product.id,
      name: product.name,
      description: product.description,
      category: product.category,
    })),
  };
  const unchangedCart = {
    id: null,
    items: [],
    totalQuantity: 0,
    subtotalMinor: 0,
    currency: "INR",
  };
  let currentCart: CartView = structuredClone(unchangedCart);
  const cart = {
    async addItems() {
      throw new CartError("Court Three only has 1 unit in stock.");
    },
    async addItem(product: (typeof products)[number]) {
      if (product.id === products[1].id) {
        throw new CartError("Court Three only has 1 unit in stock.");
      }
      currentCart = {
        id: "31000000-0000-4000-8000-000000000031",
        items: [{
          productId: product.id,
          productName: product.name,
          quantity: 2,
          cartPriceMinor: product.priceMinor,
          subtotalMinor: 700000,
        }],
        totalQuantity: 2,
        subtotalMinor: 700000,
        currency: "INR",
      };
      return currentCart;
    },
    async inspect() { return structuredClone(currentCart); },
  };
  const POST = createConversationPost({
    repository: {
      async findDuplicate() { return null; },
      async create() {
        return {
          conversationId,
          userMessageId: "51000000-0000-4000-8000-000000000031",
          context,
        };
      },
      async findOwnedContext() { return { userId, context }; },
      async saveContextAndMetadata() {},
      async append() { return "51000000-0000-4000-8000-000000000032"; },
    },
    analyzer: {
      async analyze() {
        return {
          goal: "Add two each of two Products",
          constraintDelta: { set: {}, clear: [] },
          knownEntities: [],
          missingInformation: [],
          confidence: 0.99,
          requestedEffects: ["ADD_TO_CART"],
          referencedProductIds: products.map((product) => product.id),
          requestedQuantity: 2,
        };
      },
    },
    catalog: {
      async search() { throw new Error("not used"); },
      async getProduct(productId) {
        const product = products.find((candidate) => candidate.id === productId);
        assert.ok(product);
        return { ok: true, value: product };
      },
    },
    agentLoop: { async run() { throw new Error("not used"); } },
    cart,
  });

  const response = await postAgentMessage(POST, {
    message: "Add the first and second, two of each",
  });

  const outcome = (await response.json()).data;
  assert.equal(outcome.status, "NEEDS_INPUT");
  assert.equal(outcome.message, "Court Three only has 1 unit in stock.");
  assert.deepEqual(outcome.cart, unchangedCart);
});

test("rolls back a Cart addition when its successful Conversation outcome cannot be persisted", async () => {
  const product = {
    id: "71000000-0000-4000-8000-000000000019",
    slug: "road-two",
    name: "Road Two",
    description: "A light road shoe",
    category: "Footwear",
    priceMinor: 410000,
    currency: "INR",
    inStock: true,
    attributes: {},
  };
  const context = {
    ...emptyConversationContext(),
    latestRecommendationSet: [{
      productId: product.id,
      name: product.name,
      description: product.description,
      category: product.category,
    }],
  };
  let cartQuantity = 0;
  let completions = 0;
  const POST = createConversationPost({
    repository: {
      async findDuplicate() { return null; },
      async create() {
        return {
          conversationId,
          userMessageId: "51000000-0000-4000-8000-000000000019",
          context,
        };
      },
      async findOwnedContext() { return { userId, context }; },
      async saveContextAndMetadata() {},
      async append() { return "51000000-0000-4000-8000-000000000020"; },
      async finalizeTurn() {
        completions += 1;
        if (completions === 1) throw new Error("outcome persistence failed");
      },
    },
    analyzer: {
      async analyze() {
        return {
          goal: "Add a recommended Product",
          constraintDelta: { set: {}, clear: [] },
          knownEntities: [],
          missingInformation: [],
          confidence: 0.99,
          requestedEffects: ["ADD_TO_CART"],
          referencedProductIds: [product.id],
        };
      },
    },
    catalog: {
      async search() { throw new Error("not used"); },
      async getProduct() { return { ok: true, value: product }; },
    },
    agentLoop: { async run() { throw new Error("not used"); } },
    cart: {
      async addItem(_product, _quantity, ...completionArguments: unknown[]) {
        const complete = completionArguments[0] as
          | ((cart: unknown, transaction: unknown) => Promise<void>)
          | undefined;
        const before = cartQuantity;
        cartQuantity += 1;
        const cart = {
          id: "31000000-0000-4000-8000-000000000019",
          items: [{
            productId: product.id,
            productName: product.name,
            quantity: cartQuantity,
            cartPriceMinor: product.priceMinor,
            subtotalMinor: cartQuantity * product.priceMinor,
          }],
          totalQuantity: cartQuantity,
          subtotalMinor: cartQuantity * product.priceMinor,
          currency: product.currency,
        };
        try {
          await complete?.(cart, {});
          return cart;
        } catch (error) {
          cartQuantity = before;
          throw error;
        }
      },
      async inspect() { throw new Error("not used"); },
    },
  });

  const response = await postAgentMessage(POST, {
    message: "Add the first one",
  });

  assert.equal((await response.json()).data.status, "TEMPORARILY_UNAVAILABLE");
  assert.equal(cartQuantity, 0);
});

test("adds an explicit positive whole-unit quantity", async () => {
  const product = {
    id: "71000000-0000-4000-8000-000000000013",
    slug: "road-two",
    name: "Road Two",
    description: "A light road shoe",
    category: "Footwear",
    priceMinor: 410000,
    currency: "INR",
    inStock: true,
    attributes: {},
  };
  const context = {
    ...emptyConversationContext(),
    latestRecommendationSet: [
      {
        productId: product.id,
        name: product.name,
        description: product.description,
        category: product.category,
      },
    ],
  };
  let addedQuantity: number | undefined;
  const POST = createConversationPost({
    repository: {
      async findDuplicate() { return null; },
      async create() {
        return {
          conversationId,
          userMessageId: "51000000-0000-4000-8000-000000000013",
          context,
        };
      },
      async findOwnedContext() { return { userId, context }; },
      async saveContextAndMetadata() {},
      async append() { return "51000000-0000-4000-8000-000000000014"; },
    },
    analyzer: {
      async analyze() {
        return {
          goal: "Add two Products",
          constraintDelta: { set: {}, clear: [] },
          knownEntities: [],
          missingInformation: [],
          confidence: 0.99,
          requestedEffects: ["ADD_TO_CART"],
          referencedProductIds: [product.id],
          requestedQuantity: 2,
        };
      },
    },
    catalog: {
      async search() { throw new Error("not used"); },
      async getProduct() { return { ok: true, value: product }; },
    },
    agentLoop: { async run() { throw new Error("not used"); } },
    cart: {
      async addItem(_product, quantity) {
        addedQuantity = quantity;
        return {
          id: "31000000-0000-4000-8000-000000000013",
          items: [{
            productId: product.id,
            productName: product.name,
            quantity,
            cartPriceMinor: product.priceMinor,
            subtotalMinor: quantity * product.priceMinor,
          }],
          totalQuantity: quantity,
          subtotalMinor: quantity * product.priceMinor,
          currency: product.currency,
        };
      },
      async inspect() { throw new Error("not used"); },
    },
  });

  const response = await postAgentMessage(POST, {
    message: "Add two of the first one",
  });

  assert.equal(addedQuantity, 2);
  assert.equal((await response.json()).data.cart.items[0].quantity, 2);
});

test("asks for a positive whole-unit quantity and leaves the Cart unchanged", async () => {
  const product = {
    id: "71000000-0000-4000-8000-000000000014",
    slug: "road-two",
    name: "Road Two",
    description: "A light road shoe",
    category: "Footwear",
    priceMinor: 410000,
    currency: "INR",
    inStock: true,
    attributes: {},
  };
  const context = {
    ...emptyConversationContext(),
    latestRecommendationSet: [{
      productId: product.id,
      name: product.name,
      description: product.description,
      category: product.category,
    }],
  };
  const unchangedCart = {
    id: null,
    items: [],
    totalQuantity: 0,
    subtotalMinor: 0,
    currency: "INR",
  };
  let additions = 0;
  const POST = createConversationPost({
    repository: {
      async findDuplicate() { return null; },
      async create() {
        return {
          conversationId,
          userMessageId: "51000000-0000-4000-8000-000000000015",
          context,
        };
      },
      async findOwnedContext() { return { userId, context }; },
      async saveContextAndMetadata() {},
      async append() { return "51000000-0000-4000-8000-000000000016"; },
    },
    analyzer: {
      async analyze() {
        return {
          goal: "Add part of a Product",
          constraintDelta: { set: {}, clear: [] },
          knownEntities: [],
          missingInformation: [],
          confidence: 0.99,
          requestedEffects: ["ADD_TO_CART"],
          referencedProductIds: [product.id],
          requestedQuantity: 1.5,
        };
      },
    },
    catalog: {
      async search() { throw new Error("not used"); },
      async getProduct() { return { ok: true, value: product }; },
    },
    agentLoop: { async run() { throw new Error("not used"); } },
    cart: {
      async addItem() {
        additions += 1;
        throw new Error("Invalid quantities must not mutate the Cart");
      },
      async inspect() { return unchangedCart; },
    },
  });

  const response = await postAgentMessage(POST, {
    message: "Add one and a half of the first one",
  });

  assert.equal(additions, 0);
  assert.deepEqual((await response.json()).data, {
    status: "NEEDS_INPUT",
    conversationId,
    message: "Please choose a positive whole-unit quantity from 1 to 10.",
    question: "How many units would you like, from 1 to 10?",
    missingInformation: ["Valid Cart quantity"],
    intentBrief: {
      goal: "Add part of a Product",
      constraints: emptyConversationContext().productConstraints,
      knownEntities: [],
      missingInformation: [],
      confidence: 0.99,
      requestedEffects: ["ADD_TO_CART"],
      referencedProductIds: [product.id],
      requestedQuantity: 1.5,
    },
    products: [],
    cart: unchangedCart,
  });
});

test("asks which Product to add when the Recommendation reference is ambiguous", async () => {
  const unchangedCart = {
    id: null,
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
          goal: "Add a Product",
          constraintDelta: { set: {}, clear: [] },
          knownEntities: [],
          missingInformation: ["Product"],
          confidence: 0.6,
          requestedEffects: ["ADD_TO_CART"],
        };
      },
    },
    agentLoop: {
      async run() { throw new Error("Ambiguous Cart additions must not use the model loop"); },
    },
    cart: {
      async addItem() { throw new Error("Ambiguous Cart additions must not mutate"); },
      async inspect() { return unchangedCart; },
    },
  });

  const response = await postAgentMessage(POST, {
    message: "Add one to my Cart",
  });

  assert.deepEqual((await response.json()).data, {
    status: "NEEDS_INPUT",
    conversationId,
    message: "I need one specific Product from the latest Recommendations.",
    question: "Which recommended Product would you like to add?",
    missingInformation: ["Unambiguous Product"],
    intentBrief: {
      goal: "Add a Product",
      constraints: emptyConversationContext().productConstraints,
      knownEntities: [],
      missingInformation: ["Product"],
      confidence: 0.6,
      requestedEffects: ["ADD_TO_CART"],
    },
    products: [],
    cart: unchangedCart,
  });
});

test("returns a correctable Cart rule failure with the unchanged Cart", async () => {
  const product = {
    id: "71000000-0000-4000-8000-000000000015",
    slug: "road-two",
    name: "Road Two",
    description: "A light road shoe",
    category: "Footwear",
    priceMinor: 410000,
    currency: "INR",
    inStock: true,
    attributes: {},
  };
  const context = {
    ...emptyConversationContext(),
    latestRecommendationSet: [{
      productId: product.id,
      name: product.name,
      description: product.description,
      category: product.category,
    }],
  };
  const unchangedCart = {
    id: "31000000-0000-4000-8000-000000000015",
    items: [{
      productId: product.id,
      productName: product.name,
      quantity: 9,
      cartPriceMinor: 390000,
      subtotalMinor: 3510000,
    }],
    totalQuantity: 9,
    subtotalMinor: 3510000,
    currency: "INR",
  };
  const POST = createConversationPost({
    repository: {
      async findDuplicate() { return null; },
      async create() {
        return {
          conversationId,
          userMessageId: "51000000-0000-4000-8000-000000000017",
          context,
        };
      },
      async findOwnedContext() { return { userId, context }; },
      async saveContextAndMetadata() {},
      async append() { return "51000000-0000-4000-8000-000000000018"; },
    },
    analyzer: {
      async analyze() {
        return {
          goal: "Add two Products",
          constraintDelta: { set: {}, clear: [] },
          knownEntities: [],
          missingInformation: [],
          confidence: 0.99,
          requestedEffects: ["ADD_TO_CART"],
          referencedProductIds: [product.id],
          requestedQuantity: 2,
        };
      },
    },
    catalog: {
      async search() { throw new Error("not used"); },
      async getProduct() { return { ok: true, value: product }; },
    },
    agentLoop: { async run() { throw new Error("not used"); } },
    cart: {
      async addItem() {
        throw new CartError("A Cart Item cannot have more than 10 units.");
      },
      async inspect() { return unchangedCart; },
    },
  });

  const response = await postAgentMessage(POST, {
    message: "Add two more of the first one",
  });

  assert.deepEqual((await response.json()).data, {
    status: "NEEDS_INPUT",
    conversationId,
    message: "A Cart Item cannot have more than 10 units.",
    question: "Would you like to choose a different Product or quantity?",
    missingInformation: ["Valid Cart addition"],
    intentBrief: {
      goal: "Add two Products",
      constraints: emptyConversationContext().productConstraints,
      knownEntities: [],
      missingInformation: [],
      confidence: 0.99,
      requestedEffects: ["ADD_TO_CART"],
      referencedProductIds: [product.id],
      requestedQuantity: 2,
    },
    products: [],
    cart: unchangedCart,
  });
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
    createConversationModule(userId, repository),
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
  assert.equal((await secondResponse.json()).data.conversationId, conversationId);
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

  assert.equal((await failed.json()).data.status, "TEMPORARILY_UNAVAILABLE");
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
      async getProduct() { throw new Error("not used"); },
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
      async getProduct() { throw new Error("not used"); },
    },
    agentLoop: {
      async run({ intentBrief, capabilities }) {
        assert.ok(capabilities.searchProducts);
        await capabilities.searchProducts(catalogSearchFor(intentBrief.constraints));
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
    async findDuplicate() { return null; },
    async create() {
      return {
        conversationId,
        userMessageId: "51000000-0000-4000-8000-000000000001",
        context: initialContext,
      };
    },
    async findOwnedContext() {
      return { userId, context: persistedContext };
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
      async getProduct() { throw new Error("not used"); },
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
  assert.deepEqual(catalogSearches, [
    {
      productTypes: ["shoes"],
      size: "UK 9",
      inStockOnly: true,
      limit: 8,
    },
  ]);
});

test("returns a retryable response after a second Conversation Context conflict", async () => {
  let persistedContext = emptyConversationContext();
  let saves = 0;
  let discoveryStarted = false;
  const repository: ConversationRepository = {
    async findDuplicate() { return null; },
    async create() {
      return {
        conversationId,
        userMessageId: "51000000-0000-4000-8000-000000000001",
        context: persistedContext,
      };
    },
    async findOwnedContext() {
      return { userId, context: persistedContext };
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

test("accepts a user prompt without exposing client Brand selection to the agent", async () => {
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

test("rejects an empty user prompt before creating an agent", async () => {
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

test("rejects a conversation outside the current User's ownership", async () => {
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
