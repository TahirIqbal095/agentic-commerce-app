import assert from "node:assert/strict";
import test from "node:test";
import type { CatalogModule } from "@/modules/catalog/catalog";
import {
  createCommerceAgent,
  type ConversationModule,
  type IntentAnalyzer,
  type OutcomeComposer,
} from "./commerce-agent";
import type { AgentOutcome, IntentBrief } from "./types";
import {
  createConversationModule,
  type ConversationRepository,
} from "./conversation";

const conversationId = "41000000-0000-4000-8000-000000000001";
const product = {
  id: "21000000-0000-4000-8000-000000000001",
  slug: "strideflow-daily-running-shoes",
  name: "StrideFlow Daily Running Shoes",
  description: "Breathable road-running shoes for daily training.",
  category: "Footwear",
  priceMinor: 399900,
  currency: "INR",
  inStock: true,
  attributes: { support: "Neutral", sizes: ["UK 9"] },
};
const brief: IntentBrief = {
  goal: "Find breathable shoes for road running",
  constraints: {
    productTypes: ["running shoes"],
    useCases: ["road running"],
    features: ["breathable"],
    category: "Footwear",
    minPriceMinor: null,
    maxPriceMinor: 500000,
    size: "UK 9",
    inStockOnly: true,
    attributes: { support: "Neutral" },
  },
  knownEntities: [{ type: "PRODUCT_TYPE", value: "running shoes" }],
  missingInformation: [],
  confidence: 0.94,
  requestedEffects: ["DISCOVER_PRODUCTS"],
};

test("returns a COMPLETED outcome with trusted Products and agent-composed language", async () => {
  const persisted: {
    intentBrief?: IntentBrief;
    outcome?: AgentOutcome;
  } = {};
  const analyzer: IntentAnalyzer = { async analyze() { return brief; } };
  const catalog: CatalogModule = {
    async search() { return { products: [product] }; },
    async getProduct() { throw new Error("not used"); },
  };
  const conversation: ConversationModule = {
    async startTurn() {
      return {
        conversationId,
        async recordIntentBrief(intentBrief) { persisted.intentBrief = intentBrief; },
        async complete(_message, outcome) { persisted.outcome = outcome; },
      };
    },
  };
  const composer: OutcomeComposer = {
    async composeCompleted() {
      return "The StrideFlow pair fits your road runs, budget, and UK 9 size.";
    },
    async composeQuestion() { throw new Error("not used"); },
  };

  const agent = createCommerceAgent(catalog, analyzer, conversation, {
    outcomeComposer: composer,
  });
  const outcome = await agent.respond({
    message: "I need breathable road-running shoes under ₹5,000 in UK 9",
  });

  assert.deepEqual(outcome, {
    status: "COMPLETED",
    conversationId,
    message: "The StrideFlow pair fits your road runs, budget, and UK 9 size.",
    intentBrief: brief,
    products: [product],
  });
  assert.deepEqual(persisted, { intentBrief: brief, outcome });
});

test("returns NEEDS_INPUT with one focused question for a genuinely ambiguous request", async () => {
  const ambiguousBrief: IntentBrief = {
    ...brief,
    goal: "Find a gift",
    constraints: {
      ...brief.constraints,
      productTypes: [],
      useCases: ["gift"],
      features: [],
      category: null,
      maxPriceMinor: null,
      size: null,
      attributes: {},
    },
    knownEntities: [],
    missingInformation: ["recipient interests"],
    confidence: 0.45,
  };
  let searched = false;
  let persistedOutcome: AgentOutcome | undefined;
  const agent = createCommerceAgent(
    {
      async search() { searched = true; return { products: [] }; },
      async getProduct() { throw new Error("not used"); },
    },
    { async analyze() { return ambiguousBrief; } },
    {
      async startTurn() {
        return {
          conversationId,
          async recordIntentBrief() {},
          async complete(_message, outcome) { persistedOutcome = outcome; },
        };
      },
    },
    {
      outcomeComposer: {
        async composeCompleted() { throw new Error("not used"); },
        async composeQuestion() {
          return "What kinds of things is the recipient interested in?";
        },
      },
    },
  );

  const outcome = await agent.respond({ message: "I need a gift" });

  assert.deepEqual(outcome, {
    status: "NEEDS_INPUT",
    conversationId,
    message: "What kinds of things is the recipient interested in?",
    question: "What kinds of things is the recipient interested in?",
    missingInformation: ["recipient interests"],
    intentBrief: ambiguousBrief,
    products: [],
  });
  assert.equal(searched, false);
  assert.deepEqual(persistedOutcome, outcome);
});

test("returns a retryable typed outcome when Intent analysis stays unavailable", async () => {
  let persistedOutcome: AgentOutcome | undefined;
  const agent = createCommerceAgent(
    {
      async search() { throw new Error("not used"); },
      async getProduct() { throw new Error("not used"); },
    },
    { async analyze() { throw new Error("model unavailable"); } },
    {
      async startTurn() {
        return {
          conversationId,
          async recordIntentBrief() {},
          async complete(_message, outcome) { persistedOutcome = outcome; },
        };
      },
    },
    {
      outcomeComposer: {
        async composeCompleted() { throw new Error("not used"); },
        async composeQuestion() { throw new Error("not used"); },
      },
    },
  );

  const outcome = await agent.respond({ message: "show me running shoes" });

  assert.deepEqual(outcome, {
    status: "TEMPORARILY_UNAVAILABLE",
    conversationId,
    message: "I couldn't understand that request right now. Please try again.",
    retryable: true,
    products: [],
  });
  assert.deepEqual(persistedOutcome, outcome);
});

test("returns a retryable typed outcome when conversation persistence cannot start", async () => {
  const agent = createCommerceAgent(
    {
      async search() { throw new Error("not used"); },
      async getProduct() { throw new Error("not used"); },
    },
    { async analyze() { throw new Error("not used"); } },
    {
      async startTurn() { throw new Error("database unavailable"); },
    },
    {
      outcomeComposer: {
        async composeCompleted() { throw new Error("not used"); },
        async composeQuestion() { throw new Error("not used"); },
      },
    },
  );

  const outcome = await agent.respond({ message: "show me running shoes" });

  assert.deepEqual(outcome, {
    status: "TEMPORARILY_UNAVAILABLE",
    message: "I couldn't start that conversation right now. Please try again.",
    retryable: true,
    products: [],
  });
});

test("returns a retryable typed outcome when discovery infrastructure fails", async () => {
  let persistedOutcome: AgentOutcome | undefined;
  const agent = createCommerceAgent(
    {
      async search() { throw new Error("catalog unavailable"); },
      async getProduct() { throw new Error("not used"); },
    },
    { async analyze() { return brief; } },
    {
      async startTurn() {
        return {
          conversationId,
          async recordIntentBrief() {},
          async complete(_message, outcome) { persistedOutcome = outcome; },
        };
      },
    },
    {
      outcomeComposer: {
        async composeCompleted() { throw new Error("not used"); },
        async composeQuestion() { throw new Error("not used"); },
      },
    },
  );

  const outcome = await agent.respond({ message: "show me running shoes" });

  assert.deepEqual(outcome, {
    status: "TEMPORARILY_UNAVAILABLE",
    conversationId,
    message: "Product discovery is temporarily unavailable. Please try again.",
    retryable: true,
    intentBrief: brief,
    products: [],
  });
  assert.deepEqual(persistedOutcome, outcome);
});

test("returns a retryable typed outcome when clarification language fails", async () => {
  const ambiguousBrief: IntentBrief = {
    ...brief,
    missingInformation: ["recipient interests"],
  };
  let persistedOutcome: AgentOutcome | undefined;
  const agent = createCommerceAgent(
    {
      async search() { throw new Error("not used"); },
      async getProduct() { throw new Error("not used"); },
    },
    { async analyze() { return ambiguousBrief; } },
    {
      async startTurn() {
        return {
          conversationId,
          async recordIntentBrief() {},
          async complete(_message, outcome) { persistedOutcome = outcome; },
        };
      },
    },
    {
      outcomeComposer: {
        async composeCompleted() { throw new Error("not used"); },
        async composeQuestion() { throw new Error("model unavailable"); },
      },
    },
  );

  const outcome = await agent.respond({ message: "I need a gift" });

  assert.deepEqual(outcome, {
    status: "TEMPORARILY_UNAVAILABLE",
    conversationId,
    message: "I couldn't prepare a response right now. Please try again.",
    retryable: true,
    intentBrief: ambiguousBrief,
    products: [],
  });
  assert.deepEqual(persistedOutcome, outcome);
});

test("returns a retryable typed outcome when Intent Brief persistence fails", async () => {
  let persistedOutcome: AgentOutcome | undefined;
  const agent = createCommerceAgent(
    {
      async search() { throw new Error("not used"); },
      async getProduct() { throw new Error("not used"); },
    },
    { async analyze() { return brief; } },
    {
      async startTurn() {
        return {
          conversationId,
          async recordIntentBrief() { throw new Error("database unavailable"); },
          async complete(_message, outcome) { persistedOutcome = outcome; },
        };
      },
    },
    {
      outcomeComposer: {
        async composeCompleted() { throw new Error("not used"); },
        async composeQuestion() { throw new Error("not used"); },
      },
    },
  );

  const outcome = await agent.respond({ message: "show me running shoes" });

  assert.deepEqual(outcome, {
    status: "TEMPORARILY_UNAVAILABLE",
    conversationId,
    message: "I couldn't save that request right now. Please try again.",
    retryable: true,
    intentBrief: brief,
    products: [],
  });
  assert.deepEqual(persistedOutcome, outcome);
});

test("returns a retryable typed outcome when Agent Outcome persistence fails", async () => {
  const agent = createCommerceAgent(
    {
      async search() { return { products: [product] }; },
      async getProduct() { throw new Error("not used"); },
    },
    { async analyze() { return brief; } },
    {
      async startTurn() {
        return {
          conversationId,
          async recordIntentBrief() {},
          async complete() { throw new Error("database unavailable"); },
        };
      },
    },
    {
      outcomeComposer: {
        async composeCompleted() { return "A grounded recommendation."; },
        async composeQuestion() { throw new Error("not used"); },
      },
    },
  );

  const outcome = await agent.respond({ message: "show me running shoes" });

  assert.deepEqual(outcome, {
    status: "TEMPORARILY_UNAVAILABLE",
    conversationId,
    message: "I couldn't save that response right now. Please try again.",
    retryable: true,
    intentBrief: brief,
    products: [],
  });
});

test("persists the Intent Brief and Agent Outcome as inspectable turn metadata", async () => {
  const metadataUpdates: Array<{ messageId: string; metadata: unknown }> = [];
  const appended: Array<{ role: string; content: string; metadata: unknown }> = [];
  const repository: ConversationRepository = {
    async create() {
      return {
        conversationId,
        userMessageId: "51000000-0000-4000-8000-000000000001",
      };
    },
    async findOwner() { return null; },
    async updateMetadata(messageId, metadata) {
      metadataUpdates.push({ messageId, metadata });
    },
    async append(_conversationId, role, content, metadata) {
      appended.push({ role, content, metadata });
      return "51000000-0000-4000-8000-000000000002";
    },
  };
  const agent = createCommerceAgent(
    {
      async search() { return { products: [product] }; },
      async getProduct() { throw new Error("not used"); },
    },
    { async analyze() { return brief; } },
    createConversationModule(
      "11000000-0000-4000-8000-000000000001",
      "11000000-0000-4000-8000-000000000002",
      repository,
    ),
    {
      outcomeComposer: {
        async composeCompleted() { return "A grounded recommendation."; },
        async composeQuestion() { throw new Error("not used"); },
      },
    },
  );

  const outcome = await agent.respond({ message: "show me running shoes" });
  const persistedBrief: IntentBrief = {
    ...brief,
    goal: "Discover Products",
    constraints: { ...brief.constraints, attributes: {} },
  };

  assert.deepEqual(metadataUpdates, [
    {
      messageId: "51000000-0000-4000-8000-000000000001",
      metadata: { intentBrief: persistedBrief },
    },
  ]);
  assert.deepEqual(appended, [
    {
      role: "ASSISTANT",
      content: "Product discovery completed.",
      metadata: {
        agentOutcome: {
          ...outcome,
          message: "Product discovery completed.",
          intentBrief: persistedBrief,
        },
      },
    },
  ]);
});

test("excludes credentials and unnecessary personal data from persisted intent and outcome records", async () => {
  const metadataRecords: unknown[] = [];
  const sensitiveBrief: IntentBrief = {
    ...brief,
    goal:
      "Alice wants shoes at 12 Main Street; OTP 654321; contact jane.private@example.com; reasoning: hidden notes",
    constraints: {
      ...brief.constraints,
      attributes: {
        ...brief.constraints.attributes,
        homeAddress: "12 Main Street",
        recipientName: "Alice",
        deliveryAddress: "88 Private Avenue",
        customerFullName: "Alice Private",
        internalReasoningNotes: "hidden personal inference",
      },
    },
    knownEntities: [
      { type: "PRODUCT_TYPE", value: "running shoes" },
      { type: "PRODUCT", value: "API key sk-private-credential" },
    ],
  };
  const repository: ConversationRepository = {
    async create() {
      return {
        conversationId,
        userMessageId: "51000000-0000-4000-8000-000000000001",
      };
    },
    async findOwner() { return null; },
    async updateMetadata(_messageId, metadata) { metadataRecords.push(metadata); },
    async append(_conversationId, _role, content, metadata) {
      metadataRecords.push({ content, metadata });
      return "51000000-0000-4000-8000-000000000002";
    },
  };
  const agent = createCommerceAgent(
    {
      async search() { return { products: [product] }; },
      async getProduct() { throw new Error("not used"); },
    },
    { async analyze() { return sensitiveBrief; } },
    createConversationModule(
      "11000000-0000-4000-8000-000000000001",
      "11000000-0000-4000-8000-000000000002",
      repository,
    ),
    {
      outcomeComposer: {
        async composeCompleted() {
          return "For jane.private@example.com, use token sk-private-credential.";
        },
        async composeQuestion() { throw new Error("not used"); },
      },
    },
  );

  await agent.respond({ message: "show me running shoes" });

  const persistedRecords = JSON.stringify(metadataRecords);
  assert.doesNotMatch(
    persistedRecords,
    /654321|jane\.private@example\.com|sk-private-credential|Alice|12 Main Street|88 Private Avenue|hidden notes|hidden personal inference/,
  );
  assert.doesNotMatch(persistedRecords, /chain.?of.?thought|reasoning/i);
});
