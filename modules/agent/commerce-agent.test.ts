import assert from "node:assert/strict";
import test from "node:test";
import { createCommerceAgent } from "./commerce-agent";
import type {
  CommerceAgentLoop,
  CommerceAgentLoopInput,
  CommerceAgentLoopResult,
  CommerceCapabilities,
} from "./commerce-agent";
import type { AgentOutcome } from "./agent-outcome";
import type { AgentTurn, ConversationModule } from "./conversation";
import {
  createEmptyConversationContext,
  type IntentAnalysis,
  type IntentAnalyzer,
} from "./intent";
import type { CartInspection } from "@/modules/cart/cart-inspection";
import type { CartView } from "@/modules/cart/cart";
import type { CatalogModule } from "@/modules/catalog/catalog";

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

function recordingConversation(completed: AgentOutcome[]): ConversationModule {
  return {
    async startTurn(): Promise<AgentTurn> {
      return {
        conversationId: CONVERSATION_ID,
        context: createEmptyConversationContext(),
        async recordIntentBrief() {},
        async recordRecommendationSet() {},
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
    unusedCatalog,
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
