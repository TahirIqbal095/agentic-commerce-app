import assert from "node:assert/strict";
import test from "node:test";
import {
  createCommerceAgent,
  type CommerceAgent,
  type CommerceAgentLoop,
  type IntentAnalyzer,
} from "@/modules/agent/commerce-agent";
import type { CatalogModule } from "@/modules/catalog/catalog";
import {
  createConversationModule,
  ConversationAccessError,
  type ConversationRepository,
} from "@/modules/agent/conversation";
import {
  createEmptyConversationContext as emptyConversationContext,
} from "@/modules/agent/conversation-context";
import type {
  ConversationContext,
  IntentAnalysis,
  ShoppingIntent,
} from "@/modules/agent/types";
import type { CatalogSearch } from "@/modules/catalog/types";
import { createPostHandler } from "./handler";

const conversationId = "41000000-0000-4000-8000-000000000001";
const userId = "11000000-0000-4000-8000-000000000001";

function createInMemoryConversationRepository(): ConversationRepository {
  let persistedContext: ConversationContext | undefined;
  return {
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
    async append() {
      return "51000000-0000-4000-8000-000000000002";
    },
  };
}

async function postAgentMessage(
  POST: (request: Request) => Promise<Response>,
  body: { conversationId?: string; message: string },
) {
  return POST(
    new Request("http://localhost/api/agent/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

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
  catalog = {
    async search() { return { products: [] }; },
    async getProduct() { throw new Error("not used"); },
  },
}: {
  repository: ConversationRepository;
  analyzer: IntentAnalyzer;
  agentLoop: CommerceAgentLoop;
  catalog?: CatalogModule;
}) {
  const agent = createCommerceAgent(
    catalog,
    analyzer,
    createConversationModule(userId, repository),
    { agentLoop },
  );
  return createPostHandler(async () => agent);
}

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

test("passes a conversation identifier to the Commerce Agent", async () => {
  const receivedInputs: Array<{ conversationId?: string; message: string }> = [];
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
        message: "only the waterproof ones",
      }),
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(receivedInputs, [
    {
      conversationId: "41000000-0000-4000-8000-000000000001",
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
