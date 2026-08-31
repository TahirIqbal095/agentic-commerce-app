import assert from "node:assert/strict";
import test from "node:test";
import { MockLanguageModelV4 } from "ai/test";
import { createAiIntentAnalyzer } from "./ai-intent-analyzer";
import { createEmptyConversationContext } from "./intent";

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

test("returns an explicit standalone Cart clearing operation", async () => {
  const clearing = {
    goal: "Clear the Cart",
    constraintDelta: { set: {}, clear: [] },
    knownEntities: [],
    missingInformation: [],
    confidence: 0.99,
    requestedEffects: ["CLEAR_CART"],
    requestedCartMutations: [{ type: "CLEAR" }],
  };
  const analyzer = createAiIntentAnalyzer(new MockLanguageModelV4({
    doGenerate: async () => modelResponse(clearing),
  }));

  assert.deepEqual(await analyzer.analyze({
    context: createEmptyConversationContext(),
    message: "Clear my Cart",
  }), clearing);
});

test("returns an explicit Cart quantity for application validation", async () => {
  const explicitQuantity = {
    goal: "Add a recommended Product",
    constraintDelta: { set: {}, clear: [] },
    knownEntities: [],
    missingInformation: [],
    confidence: 0.99,
    requestedEffects: ["ADD_TO_CART"],
    referencedProductIds: ["71000000-0000-4000-8000-000000000001"],
    requestedQuantity: 2,
  };
  const model = new MockLanguageModelV4({
    doGenerate: async () => modelResponse(explicitQuantity),
  });

  const analyzer = createAiIntentAnalyzer(model);

  assert.deepEqual(
    await analyzer.analyze({
      context: createEmptyConversationContext(),
      message: "Add two of the first one",
    }),
    explicitQuantity,
  );
});

test("returns an explicit Cart Item Removal reference", async () => {
  const removal = {
    goal: "Remove a Cart Item",
    constraintDelta: { set: {}, clear: [] },
    knownEntities: [{ type: "PRODUCT", value: "Trail One" }],
    missingInformation: [],
    confidence: 0.99,
    requestedEffects: ["REMOVE_FROM_CART"],
    requestedCartItemReference: "Trail One",
  };
  const model = new MockLanguageModelV4({
    doGenerate: async () => modelResponse(removal),
  });

  const analyzer = createAiIntentAnalyzer(model);

  assert.deepEqual(
    await analyzer.analyze({
      context: createEmptyConversationContext(),
      message: "Remove Trail One from my Cart",
    }),
    removal,
  );
});

test("returns a relative Cart Quantity Change", async () => {
  const change = {
    goal: "Increase a Cart Item quantity",
    constraintDelta: { set: {}, clear: [] },
    knownEntities: [{ type: "PRODUCT", value: "Trail One" }],
    missingInformation: [],
    confidence: 0.99,
    requestedEffects: ["CHANGE_CART_QUANTITY"],
    requestedCartItemReference: "Trail One",
    requestedCartQuantityChange: { mode: "RELATIVE", quantity: 1 },
  };
  const analyzer = createAiIntentAnalyzer(new MockLanguageModelV4({
    doGenerate: async () => modelResponse(change),
  }));

  assert.deepEqual(await analyzer.analyze({
    context: createEmptyConversationContext(),
    message: "Add one more Trail One",
  }), change);
});

test("returns an exact Cart Quantity Change", async () => {
  const change = {
    goal: "Set a Cart Item quantity",
    constraintDelta: { set: {}, clear: [] },
    knownEntities: [{ type: "PRODUCT", value: "Trail One" }],
    missingInformation: [],
    confidence: 0.99,
    requestedEffects: ["CHANGE_CART_QUANTITY"],
    requestedCartItemReference: "Trail One",
    requestedCartQuantityChange: { mode: "EXACT", quantity: 3 },
  };
  const analyzer = createAiIntentAnalyzer(new MockLanguageModelV4({
    doGenerate: async () => modelResponse(change),
  }));

  assert.deepEqual(await analyzer.analyze({
    context: createEmptyConversationContext(),
    message: "Make Trail One three",
  }), change);
});

test("returns an ordered batch of mixed Cart Mutations", async () => {
  const mutations = {
    goal: "Apply several Cart Mutations",
    constraintDelta: { set: {}, clear: [] },
    knownEntities: [],
    missingInformation: [],
    confidence: 0.99,
    requestedEffects: [
      "ADD_TO_CART",
      "REMOVE_FROM_CART",
      "CHANGE_CART_QUANTITY",
    ],
    requestedCartMutations: [
      {
        type: "ADD",
        productId: "71000000-0000-4000-8000-000000000001",
        quantity: 2,
      },
      { type: "REMOVE", reference: "Trail One" },
      {
        type: "CHANGE_QUANTITY",
        reference: "Court Three",
        change: { mode: "RELATIVE", quantity: 1 },
      },
      {
        type: "CHANGE_QUANTITY",
        reference: "Gym Four",
        change: { mode: "EXACT", quantity: 3 },
      },
    ],
  };
  const analyzer = createAiIntentAnalyzer(new MockLanguageModelV4({
    doGenerate: async () => modelResponse(mutations),
  }));

  assert.deepEqual(await analyzer.analyze({
    context: createEmptyConversationContext(),
    message: "Add two Road Two, remove Trail One, add one Court Three, and make Gym Four three",
  }), mutations);
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
