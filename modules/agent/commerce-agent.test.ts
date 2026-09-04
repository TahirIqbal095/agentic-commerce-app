import assert from "node:assert/strict";
import test from "node:test";
import { MockLanguageModelV4 } from "ai/test";
import { createCommerceAgent } from "./commerce-agent";
import type {
  CommerceAgentLimits,
  CommerceAgentLoop,
  CommerceAgentLoopInput,
  CommerceAgentLoopResult,
  CommerceCapabilities,
} from "./commerce-agent";
import { createAiCommerceAgentLoop } from "./ai-commerce-agent-loop";
import type { AgentOutcome } from "./agent-outcome";
import type { AgentTurn, ConversationModule } from "./conversation";
import {
  createEmptyConversationContext,
  IntentAnalysisTimeoutError,
  type IntentAnalysis,
  type IntentAnalyzer,
} from "./intent";
import type { CartInspection } from "@/modules/cart/cart-inspection";
import type { CartView } from "@/modules/cart/cart";
import type { CatalogModule } from "@/modules/catalog/catalog";
import type { CatalogProduct, CatalogSearch } from "@/modules/catalog/types";

const CONVERSATION_ID = "21000000-0000-4000-8000-000000000001";

const STOCKED_CART: CartView = {
  id: "31000000-0000-4000-8000-000000000001",
  version: 4,
  items: [
    {
      productId: "11000000-0000-4000-8000-000000000001",
      productName: "Quiet Buds",
      quantity: 2,
      cartPriceMinor: 349900,
      subtotalMinor: 699800,
    },
    {
      productId: "11000000-0000-4000-8000-000000000002",
      productName: "Trail Runner",
      quantity: 1,
      cartPriceMinor: 899900,
      subtotalMinor: 899900,
    },
  ],
  totalQuantity: 3,
  subtotalMinor: 1599700,
  currency: "INR",
};

const EMPTY_CART: CartView = {
  id: null,
  version: 0,
  items: [],
  totalQuantity: 0,
  subtotalMinor: 0,
  currency: "INR",
};

function analysis(
  requestedEffects: IntentAnalysis["requestedEffects"],
): IntentAnalysis {
  return {
    goal: "Understand the current Cart",
    constraintDelta: { set: {}, clear: [] },
    knownEntities: [],
    missingInformation: [],
    confidence: 0.9,
    requestedEffects,
  };
}

function analyzerReturning(result: IntentAnalysis): IntentAnalyzer {
  return { async analyze() { return result; } };
}

function recordingConversation(
  completed: AgentOutcome[],
  recommendationSets: CatalogProduct[][] = [],
  recommendationsAccepted = true,
): ConversationModule {
  return {
    async startTurn(): Promise<AgentTurn> {
      return {
        conversationId: CONVERSATION_ID,
        context: createEmptyConversationContext(),
        async recordIntentBrief() {},
        async recordRecommendationSet(products) {
          recommendationSets.push(products);
          return recommendationsAccepted;
        },
        async complete(_message, outcome) {
          completed.push(outcome);
        },
      };
    },
  };
}

const unusedCatalog: CatalogModule = {
  async search() {
    throw new Error("Cart inspection must not search the Catalog.");
  },
  async getProduct() {
    throw new Error("Cart inspection must not read the Catalog.");
  },
};

function loopReturning(
  result: CommerceAgentLoopResult,
  observe?: (input: CommerceAgentLoopInput) => void,
): CommerceAgentLoop {
  return {
    async run(input) {
      observe?.(input);
      return result;
    },
  };
}

const rejectingLoop: CommerceAgentLoop = {
  async run() {
    throw new Error("The Commerce Agent loop must not run for Cart inspection.");
  },
};

test("a Cart-dependent Customer message returns the authoritative Cart snapshot", async () => {
  const completed: AgentOutcome[] = [];
  const agent = createCommerceAgent(
    unusedCatalog,
    analyzerReturning(analysis(["INSPECT_CART"])),
    recordingConversation(completed),
    {
      agentLoop: rejectingLoop,
      cartInspection: { async inspectCart() { return STOCKED_CART; } },
    },
  );

  const outcome = await agent.respond({
    idempotencyKey: "41000000-0000-4000-8000-000000000001",
    message: "What is in my Cart?",
  });

  assert.equal(outcome.status, "COMPLETED");
  assert.deepEqual(outcome.cart, STOCKED_CART);
  assert.deepEqual(completed.at(-1)?.cart, STOCKED_CART);
});

test("an unrelated Customer message never reads or exposes the Cart", async () => {
  const completed: AgentOutcome[] = [];
  let inspections = 0;
  let loopCapabilities: CommerceCapabilities | null = null;
  const agent = createCommerceAgent(
    catalogReturning([]),
    analyzerReturning(analysis(["DISCOVER_PRODUCTS"])),
    recordingConversation(completed),
    {
      agentLoop: loopReturning(
        { status: "COMPLETED", message: "Here are some options.", productIds: [] },
        (input) => {
          loopCapabilities = input.capabilities;
        },
      ),
      cartInspection: {
        async inspectCart() {
          inspections += 1;
          return STOCKED_CART;
        },
      },
    },
  );

  const outcome = await agent.respond({
    idempotencyKey: "41000000-0000-4000-8000-000000000002",
    message: "Show me running shoes.",
  });

  assert.equal(inspections, 0);
  assert.equal(outcome.cart, undefined);
  assert.deepEqual(Object.keys(loopCapabilities ?? {}), ["searchProducts", "getProduct"]);
});

test("an empty Cart returns an explicit empty Cart snapshot", async () => {
  const completed: AgentOutcome[] = [];
  const agent = createCommerceAgent(
    unusedCatalog,
    analyzerReturning(analysis(["INSPECT_CART"])),
    recordingConversation(completed),
    {
      agentLoop: rejectingLoop,
      cartInspection: { async inspectCart() { return EMPTY_CART; } },
    },
  );

  const outcome = await agent.respond({
    idempotencyKey: "41000000-0000-4000-8000-000000000003",
    message: "What is in my Cart?",
  });

  assert.equal(outcome.status, "COMPLETED");
  assert.deepEqual(outcome.cart, EMPTY_CART);
  assert.equal(outcome.message, "Your Cart is empty.");
});

test("a failed Cart inspection is retryable and fabricates no Cart values", async () => {
  const completed: AgentOutcome[] = [];
  const agent = createCommerceAgent(
    unusedCatalog,
    analyzerReturning(analysis(["INSPECT_CART"])),
    recordingConversation(completed),
    {
      agentLoop: rejectingLoop,
      cartInspection: {
        async inspectCart() {
          throw new Error("The Cart is unavailable.");
        },
      },
    },
  );

  const outcome = await agent.respond({
    idempotencyKey: "41000000-0000-4000-8000-000000000004",
    message: "What is in my Cart?",
  });

  assert.equal(outcome.status, "TEMPORARILY_UNAVAILABLE");
  assert.equal(outcome.retryable, true);
  assert.equal(outcome.cart, undefined);
  assert.deepEqual(outcome.products, []);
  assert.equal(/\d/.test(outcome.message), false);
});

test("a Cart-dependent message without an inspection capability stays retryable", async () => {
  const completed: AgentOutcome[] = [];
  const agent = createCommerceAgent(
    unusedCatalog,
    analyzerReturning(analysis(["INSPECT_CART"])),
    recordingConversation(completed),
    { agentLoop: rejectingLoop },
  );

  const outcome = await agent.respond({
    idempotencyKey: "41000000-0000-4000-8000-000000000005",
    message: "What is in my Cart?",
  });

  assert.equal(outcome.status, "TEMPORARILY_UNAVAILABLE");
  assert.equal(outcome.retryable, true);
  assert.equal(outcome.cart, undefined);
});

test("the Cart inspection sentence never carries a commercial value", async () => {
  const sentences: string[] = [];
  for (const cart of [STOCKED_CART, EMPTY_CART]) {
    const inspection: CartInspection = { async inspectCart() { return cart; } };
    const agent = createCommerceAgent(
      unusedCatalog,
      analyzerReturning(analysis(["INSPECT_CART"])),
      recordingConversation([]),
      { agentLoop: rejectingLoop, cartInspection: inspection },
    );

    const outcome = await agent.respond({
      idempotencyKey: "41000000-0000-4000-8000-000000000006",
      message: "What is in my Cart?",
    });
    sentences.push(outcome.message);
  }

  for (const sentence of sentences) {
    assert.equal(
      /[\d₹]/.test(sentence),
      false,
      `Only the Cart Summary may state commercial values, not "${sentence}".`,
    );
  }
  assert.equal(new Set(sentences).size, 2);
});

const RUNNING_SHOES: CatalogProduct[] = [
  {
    id: "11000000-0000-4000-8000-000000000101",
    slug: "trail-runner",
    name: "Trail Runner",
    description: "A cushioned trail shoe.",
    category: "Footwear",
    priceMinor: 899900,
    currency: "INR",
    inStock: true,
    attributes: {},
  },
  {
    id: "11000000-0000-4000-8000-000000000102",
    slug: "road-racer",
    name: "Road Racer",
    description: "A light road shoe.",
    category: "Footwear",
    priceMinor: 749900,
    currency: "INR",
    inStock: true,
    attributes: {},
  },
];

const FABRICATED_PRODUCT_ID = "11000000-0000-4000-8000-0000000009ff";

const MODEL_USAGE = {
  inputTokens: { total: 20, noCache: 20, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 30, text: 30, reasoning: 0 },
};

function catalogSearchStep(search: CatalogSearch) {
  return {
    content: [
      {
        type: "tool-call" as const,
        toolCallId: "catalog-search",
        toolName: "searchProducts",
        input: JSON.stringify(search),
      },
    ],
    finishReason: { unified: "tool-calls" as const, raw: "tool-calls" },
    usage: MODEL_USAGE,
    warnings: [],
  };
}

function answerStep(answer: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(answer) }],
    finishReason: { unified: "stop" as const, raw: "stop" },
    usage: MODEL_USAGE,
    warnings: [],
  };
}

/** Replays one model response per step, repeating the last if asked again. */
function modelReplaying(
  ...steps: Array<
    ReturnType<typeof catalogSearchStep> | ReturnType<typeof answerStep>
  >
): MockLanguageModelV4 {
  let step = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      const response = steps[Math.min(step, steps.length - 1)];
      step += 1;
      return response;
    },
  });
}

function catalogReturning(
  products: CatalogProduct[],
  observe?: (search: CatalogSearch) => void,
): CatalogModule {
  return {
    async search(search) {
      observe?.(search);
      return { products };
    },
    async getProduct(productId) {
      const product = products.find(({ id }) => id === productId);
      return product
        ? { ok: true, value: product }
        : {
            ok: false,
            error: {
              code: "PRODUCT_NOT_FOUND",
              message: "No such Product.",
              details: {},
            },
          };
    },
  };
}

const unavailableCatalog: CatalogModule = {
  async search() {
    throw new Error("The Catalog is unavailable.");
  },
  async getProduct() {
    throw new Error("The Catalog is unavailable.");
  },
};

/** A Commerce Agent budget small enough for a Turn to exhaust it in a test. */
const CUT_SHORT_LIMITS: CommerceAgentLimits = {
  maxSteps: 5,
  timeoutMs: 20,
  maxOutputTokens: 2_000,
  maxToolProducts: 8,
};

function discoveryAgent(
  catalog: CatalogModule,
  model: MockLanguageModelV4,
  conversation: ConversationModule,
  limits?: CommerceAgentLimits,
) {
  return createCommerceAgent(
    catalog,
    analyzerReturning(analysis(["DISCOVER_PRODUCTS"])),
    conversation,
    {
      agentLoop: createAiCommerceAgentLoop(model),
      ...(limits ? { limits } : {}),
    },
  );
}

function assertBlamesNobody(message: string) {
  assert.equal(
    /narrow|be more specific|try a different/i.test(message),
    false,
    `A Storefront shortfall must never read as a Customer one: "${message}".`,
  );
}

test("a completed answer that also offers a refinement still returns its Products", async () => {
  const completed: AgentOutcome[] = [];
  const recommendationSets: CatalogProduct[][] = [];
  const agent = discoveryAgent(
    catalogReturning(RUNNING_SHOES),
    modelReplaying(
      catalogSearchStep({ limit: 8 }),
      answerStep({
        status: "COMPLETED",
        message: "Here are two running shoes.",
        productIds: RUNNING_SHOES.map(({ id }) => id),
        question: "Are you looking for road or trail?",
        missingInformation: [],
      }),
    ),
    recordingConversation(completed, recommendationSets),
  );

  const outcome = await agent.respond({
    idempotencyKey: "41000000-0000-4000-8000-000000000101",
    message: "show me some running shoes",
  });

  assert.equal(outcome.status, "COMPLETED");
  assert.equal(outcome.message, "Here are two running shoes.");
  assert.deepEqual(outcome.products, RUNNING_SHOES);
  assert.deepEqual(recommendationSets.at(-1), RUNNING_SHOES);
});

test("a Product ID the Commerce Agent never read is refused", async () => {
  const completed: AgentOutcome[] = [];
  const agent = discoveryAgent(
    catalogReturning(RUNNING_SHOES),
    modelReplaying(
      catalogSearchStep({ limit: 8 }),
      answerStep({
        status: "COMPLETED",
        message: "The Sprint Elite is perfect for you at ₹4,999.",
        productIds: [FABRICATED_PRODUCT_ID],
        question: null,
        missingInformation: [],
      }),
    ),
    recordingConversation(completed),
  );

  const outcome = await agent.respond({
    idempotencyKey: "41000000-0000-4000-8000-000000000102",
    message: "show me some running shoes",
  });

  assert.equal(
    outcome.products.some(({ id }) => id === FABRICATED_PRODUCT_ID),
    false,
  );
  assert.notEqual(
    outcome.message,
    "The Sprint Elite is perfect for you at ₹4,999.",
  );
});

test("a malformed Product ID is refused", async () => {
  const completed: AgentOutcome[] = [];
  const agent = discoveryAgent(
    catalogReturning(RUNNING_SHOES),
    modelReplaying(
      catalogSearchStep({ limit: 8 }),
      answerStep({
        status: "COMPLETED",
        message: "Try the Sprint Elite.",
        productIds: ["sprint-elite"],
        question: null,
        missingInformation: [],
      }),
    ),
    recordingConversation(completed),
  );

  const outcome = await agent.respond({
    idempotencyKey: "41000000-0000-4000-8000-000000000103",
    message: "show me some running shoes",
  });

  assert.notEqual(outcome.message, "Try the Sprint Elite.");
  assert.deepEqual(
    outcome.products.map(({ id }) => id),
    RUNNING_SHOES.map(({ id }) => id),
  );
});

test("a Turn that needs more information still shows the Products already found", async () => {
  const completed: AgentOutcome[] = [];
  const agent = discoveryAgent(
    catalogReturning(RUNNING_SHOES),
    modelReplaying(
      catalogSearchStep({ limit: 8 }),
      answerStep({
        status: "NEEDS_INPUT",
        message: "I found two, and one detail would narrow this further.",
        productIds: [],
        question: "What size do you wear?",
        missingInformation: Array.from(
          { length: 12 },
          (_, index) => `Detail ${index}`,
        ),
      }),
    ),
    recordingConversation(completed),
  );

  const outcome = await agent.respond({
    idempotencyKey: "41000000-0000-4000-8000-000000000104",
    message: "show me some running shoes",
  });

  assert.equal(outcome.status, "NEEDS_INPUT");
  assert.deepEqual(outcome.products, RUNNING_SHOES);
  assert.equal(outcome.missingInformation?.length, 8);
});

test("a Commerce Agent cut short still returns Catalog Products", async () => {
  const completed: AgentOutcome[] = [];
  const recommendationSets: CatalogProduct[][] = [];
  const agent = discoveryAgent(
    catalogReturning(RUNNING_SHOES),
    new MockLanguageModelV4({
      doGenerate: () => new Promise<never>(() => {}),
    }),
    recordingConversation(completed, recommendationSets),
    CUT_SHORT_LIMITS,
  );

  const outcome = await agent.respond({
    idempotencyKey: "41000000-0000-4000-8000-000000000105",
    message: "show me some running shoes",
  });

  assert.equal(outcome.status, "COMPLETED");
  assert.deepEqual(outcome.products, RUNNING_SHOES);
  assert.deepEqual(recommendationSets.at(-1), RUNNING_SHOES);
  assert.match(outcome.message, /too long/);
  assertBlamesNobody(outcome.message);
});

test("an unavailable Commerce Agent still returns Catalog Products", async () => {
  const completed: AgentOutcome[] = [];
  const agent = discoveryAgent(
    catalogReturning(RUNNING_SHOES),
    new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error("503 UNAVAILABLE");
      },
    }),
    recordingConversation(completed),
  );

  const outcome = await agent.respond({
    idempotencyKey: "41000000-0000-4000-8000-000000000106",
    message: "show me some running shoes",
  });

  assert.equal(outcome.status, "COMPLETED");
  assert.deepEqual(outcome.products, RUNNING_SHOES);
  assert.doesNotMatch(outcome.message, /too long|slow/);
  assertBlamesNobody(outcome.message);
});

test("a speculative Catalog Product never becomes quotable by the Commerce Agent", async () => {
  const completed: AgentOutcome[] = [];
  const agent = discoveryAgent(
    catalogReturning(RUNNING_SHOES),
    modelReplaying(
      answerStep({
        status: "COMPLETED",
        message: "The Trail Runner is in stock at ₹8,999.",
        productIds: [RUNNING_SHOES[0].id],
        question: null,
        missingInformation: [],
      }),
    ),
    recordingConversation(completed),
  );

  const outcome = await agent.respond({
    idempotencyKey: "41000000-0000-4000-8000-000000000107",
    message: "show me some running shoes",
  });

  assert.notEqual(outcome.message, "The Trail Runner is in stock at ₹8,999.");
  assert.doesNotMatch(outcome.message, /too long|slow/);
  assertBlamesNobody(outcome.message);
});

test("a Turn that matches nothing says so instead of blaming the Customer", async () => {
  const completed: AgentOutcome[] = [];
  const recommendationSets: CatalogProduct[][] = [];
  const agent = discoveryAgent(
    catalogReturning([]),
    new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error("503 UNAVAILABLE");
      },
    }),
    recordingConversation(completed, recommendationSets),
  );

  const outcome = await agent.respond({
    idempotencyKey: "41000000-0000-4000-8000-000000000108",
    message: "show me some running shoes",
  });

  assert.equal(outcome.status, "COMPLETED");
  assert.deepEqual(outcome.products, []);
  assert.deepEqual(recommendationSets, []);
  assertBlamesNobody(outcome.message);
});

test("a Turn the Storefront cannot answer at all stays retryable", async () => {
  const completed: AgentOutcome[] = [];
  const agent = discoveryAgent(
    unavailableCatalog,
    new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error("503 UNAVAILABLE");
      },
    }),
    recordingConversation(completed),
  );

  const outcome = await agent.respond({
    idempotencyKey: "41000000-0000-4000-8000-000000000109",
    message: "show me some running shoes",
  });

  assert.equal(outcome.status, "TEMPORARILY_UNAVAILABLE");
  assert.equal(outcome.retryable, true);
  assert.doesNotMatch(outcome.message, /in time|too long/);
  assertBlamesNobody(outcome.message);
});

test("a Turn that truly ran out of budget says so even with nothing to show", async () => {
  const completed: AgentOutcome[] = [];
  const agent = discoveryAgent(
    unavailableCatalog,
    new MockLanguageModelV4({
      doGenerate: () => new Promise<never>(() => {}),
    }),
    recordingConversation(completed),
    CUT_SHORT_LIMITS,
  );

  const outcome = await agent.respond({
    idempotencyKey: "41000000-0000-4000-8000-000000000112",
    message: "show me some running shoes",
  });

  assert.equal(outcome.status, "TEMPORARILY_UNAVAILABLE");
  assert.match(outcome.message, /in time/);
  assertBlamesNobody(outcome.message);
});

test("a shape deviation is normalised rather than discarded", async () => {
  const completed: AgentOutcome[] = [];
  const agent = discoveryAgent(
    catalogReturning(RUNNING_SHOES),
    modelReplaying(
      catalogSearchStep({ limit: 8 }),
      answerStep({
        status: "COMPLETED",
        message: `Here are two running shoes. ${"They are great. ".repeat(120)}`,
        productIds: [
          RUNNING_SHOES[0].id,
          RUNNING_SHOES[0].id,
          RUNNING_SHOES[1].id,
        ],
        privateReasoning: "The Customer probably runs marathons.",
      }),
    ),
    recordingConversation(completed),
  );

  const outcome = await agent.respond({
    idempotencyKey: "41000000-0000-4000-8000-000000000110",
    message: "show me some running shoes",
  });

  assert.equal(outcome.status, "COMPLETED");
  assert.deepEqual(outcome.products, RUNNING_SHOES);
  assert.equal(outcome.message.length, 1_200);
  assert.equal(
    outcome.message.includes("The Customer probably runs marathons."),
    false,
  );
});

test("a Turn whose Intent Brief runs out of time blames the Storefront", async () => {
  const completed: AgentOutcome[] = [];
  const agent = createCommerceAgent(
    catalogReturning(RUNNING_SHOES),
    {
      async analyze(): Promise<IntentAnalysis> {
        throw new IntentAnalysisTimeoutError();
      },
    },
    recordingConversation(completed),
    { agentLoop: rejectingLoop },
  );

  const outcome = await agent.respond({
    idempotencyKey: "41000000-0000-4000-8000-000000000111",
    message: "show me some running shoes",
  });

  assert.equal(outcome.status, "TEMPORARILY_UNAVAILABLE");
  assert.match(outcome.message, /in time/);
  assertBlamesNobody(outcome.message);
});

test("a completed answer naming no Products still shows what the Catalog holds", async () => {
  const completed: AgentOutcome[] = [];
  const recommendationSets: CatalogProduct[][] = [];
  const agent = discoveryAgent(
    catalogReturning(RUNNING_SHOES),
    modelReplaying(
      answerStep({
        status: "COMPLETED",
        message: "I had a look but I'm not naming anything.",
        productIds: [],
        question: null,
        missingInformation: [],
      }),
    ),
    recordingConversation(completed, recommendationSets),
  );

  const outcome = await agent.respond({
    idempotencyKey: "41000000-0000-4000-8000-000000000113",
    message: "show me some running shoes",
  });

  assert.equal(outcome.status, "COMPLETED");
  assert.deepEqual(outcome.products, RUNNING_SHOES);
  assert.deepEqual(recommendationSets.at(-1), RUNNING_SHOES);
  assertBlamesNobody(outcome.message);
});

test("a needs-input answer that asks nothing is read as the answer it is", async () => {
  const completed: AgentOutcome[] = [];
  const agent = discoveryAgent(
    catalogReturning(RUNNING_SHOES),
    modelReplaying(
      catalogSearchStep({ limit: 8 }),
      answerStep({
        status: "NEEDS_INPUT",
        message: "Here are two running shoes.",
        productIds: RUNNING_SHOES.map(({ id }) => id),
        question: null,
        missingInformation: [],
      }),
    ),
    recordingConversation(completed),
  );

  const outcome = await agent.respond({
    idempotencyKey: "41000000-0000-4000-8000-000000000114",
    message: "show me some running shoes",
  });

  assert.equal(outcome.status, "COMPLETED");
  assert.equal(outcome.message, "Here are two running shoes.");
  assert.deepEqual(outcome.products, RUNNING_SHOES);
});

test("Products a concurrent Turn refused to record are never offered for reference", async () => {
  const completed: AgentOutcome[] = [];
  const agent = discoveryAgent(
    catalogReturning(RUNNING_SHOES),
    new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error("503 UNAVAILABLE");
      },
    }),
    recordingConversation(completed, [], false),
  );

  const outcome = await agent.respond({
    idempotencyKey: "41000000-0000-4000-8000-000000000115",
    message: "show me some running shoes",
  });

  assert.equal(outcome.status, "TEMPORARILY_UNAVAILABLE");
  assert.equal(outcome.retryable, true);
  assert.deepEqual(outcome.products, []);
});
