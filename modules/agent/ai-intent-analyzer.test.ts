import assert from "node:assert/strict";
import test from "node:test";
import { MockLanguageModelV4 } from "ai/test";
import { createAiIntentAnalyzer } from "./ai-intent-interpreter";

const validBrief = {
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

test("returns a typed Intent Brief for Product discovery", async () => {
  const model = new MockLanguageModelV4({
    doGenerate: async () => modelResponse(validBrief),
  });

  const analyzer = createAiIntentAnalyzer(model);

  assert.deepEqual(
    await analyzer.analyze(
      "I need breathable road-running shoes under ₹5,000 in UK 9",
    ),
    validBrief,
  );
});

test("retries malformed Intent Brief output once", async () => {
  let attempts = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      attempts += 1;
      return modelResponse(attempts === 1 ? { goal: "incomplete" } : validBrief);
    },
  });

  const analyzer = createAiIntentAnalyzer(model);

  assert.deepEqual(await analyzer.analyze("show me running shoes"), validBrief);
  assert.equal(attempts, 2);
});

test("rejects undeclared private fields after one retry", async () => {
  let attempts = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      attempts += 1;
      return modelResponse({
        ...validBrief,
        privateChainOfThought: "hidden reasoning",
      });
    },
  });

  const analyzer = createAiIntentAnalyzer(model);

  await assert.rejects(analyzer.analyze("show me running shoes"));
  assert.equal(attempts, 2);
});
