import assert from "node:assert/strict";
import test from "node:test";
import { MockLanguageModelV4 } from "ai/test";
import { createAiIntentAnalyzer } from "./ai-intent-analyzer";
import {
  createEmptyConversationContext,
  IntentAnalysisTimeoutError,
} from "./intent";

const validAnalysis = {
  goal: "Find breathable shoes for road running",
  constraintDelta: {
    set: {
      productTypes: ["running shoes"],
      useCases: ["road running"],
      features: ["breathable"],
      category: "Footwear",
      maxPriceMinor: 500000,
      size: "UK 9",
      attributes: { support: "Neutral" },
    },
    clear: [],
  },
  knownEntities: [{ type: "PRODUCT_TYPE", value: "running shoes" }],
  missingInformation: [],
  confidence: 0.94,
  requestedEffects: ["DISCOVER_PRODUCTS"],
};

function modelResponse(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    finishReason: { unified: "stop" as const, raw: "stop" },
    usage: {
      inputTokens: { total: 20, noCache: 20, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 30, text: 30, reasoning: 0 },
    },
    warnings: [],
  };
}

test("returns typed Product constraint set and clear operations", async () => {
  const model = new MockLanguageModelV4({
    doGenerate: async () => modelResponse(validAnalysis),
  });

  const analyzer = createAiIntentAnalyzer(model);

  assert.deepEqual(
    await analyzer.analyze({
      context: createEmptyConversationContext(),
      message: "I need breathable road-running shoes under ₹5,000 in UK 9",
    }),
    validAnalysis,
  );
  assert.deepEqual(model.doGenerateCalls[0].prompt.slice(1), [
    {
      role: "user",
      providerOptions: undefined,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            conversationContext: createEmptyConversationContext(),
            newestCustomerMessage:
              "I need breathable road-running shoes under ₹5,000 in UK 9",
          }),
        },
      ],
    },
  ]);
});

test("returns an INSPECT_CART effect for a conversational Cart-inspection request", async () => {
  const cartInspection = {
    goal: "Inspect Cart",
    constraintDelta: { set: {}, clear: [] },
    knownEntities: [],
    missingInformation: [],
    confidence: 0.99,
    requestedEffects: ["INSPECT_CART"],
  };
  const model = new MockLanguageModelV4({
    doGenerate: async () => modelResponse(cartInspection),
  });

  const analyzer = createAiIntentAnalyzer(model);

  assert.deepEqual(
    await analyzer.analyze({
      context: createEmptyConversationContext(),
      message: "What's in my Cart?",
    }),
    cartInspection,
  );
});

test("resolves a conversational Add request as a read-only Product presentation", async () => {
  const productPresentation = {
    goal: "Present a recommended Product with its Add control",
    constraintDelta: { set: {}, clear: [] },
    knownEntities: [],
    missingInformation: [],
    confidence: 0.99,
    requestedEffects: ["PRESENT_ADD_CONTROLS"],
    referencedProductIds: ["71000000-0000-4000-8000-000000000001"],
  };
  const model = new MockLanguageModelV4({
    doGenerate: async () => modelResponse(productPresentation),
  });

  const analyzer = createAiIntentAnalyzer(model);

  assert.deepEqual(
    await analyzer.analyze({
      context: createEmptyConversationContext(),
      message: "Add two of the first one",
    }),
    productPresentation,
  );
});

test("retries malformed Intent Brief output once", async () => {
  let attempts = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      attempts += 1;
      return modelResponse(
        attempts === 1 ? { goal: "incomplete" } : validAnalysis,
      );
    },
  });

  const analyzer = createAiIntentAnalyzer(model);

  assert.deepEqual(
    await analyzer.analyze({
      context: createEmptyConversationContext(),
      message: "show me running shoes",
    }),
    validAnalysis,
  );
  assert.equal(attempts, 2);
});

test("rejects undeclared private fields after one retry", async () => {
  let attempts = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      attempts += 1;
      return modelResponse({
        ...validAnalysis,
        privateChainOfThought: "hidden reasoning",
      });
    },
  });

  const analyzer = createAiIntentAnalyzer(model);

  await assert.rejects(
    analyzer.analyze({
      context: createEmptyConversationContext(),
      message: "show me running shoes",
    }),
  );
  assert.equal(attempts, 2);
});

test("an Intent Brief analysis that outlives its budget stops instead of hanging", async () => {
  const model = new MockLanguageModelV4({
    doGenerate: () => new Promise<never>(() => {}),
  });

  const analyzer = createAiIntentAnalyzer(model, 20);

  await assert.rejects(
    analyzer.analyze({
      context: createEmptyConversationContext(),
      message: "show me running shoes",
    }),
    IntentAnalysisTimeoutError,
  );
});

test("the retry of a malformed Intent Brief shares the first attempt's budget", async () => {
  let attempts = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      attempts += 1;
      if (attempts === 1) return modelResponse({ goal: "incomplete" });
      return new Promise<never>(() => {});
    },
  });

  const analyzer = createAiIntentAnalyzer(model, 40);

  await assert.rejects(
    analyzer.analyze({
      context: createEmptyConversationContext(),
      message: "show me running shoes",
    }),
    IntentAnalysisTimeoutError,
  );
  assert.equal(attempts, 2);
});
