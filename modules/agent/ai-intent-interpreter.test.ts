import assert from "node:assert/strict";
import test from "node:test";
import { MockLanguageModelV4 } from "ai/test";
import { createAiIntentInterpreter } from "./ai-intent-interpreter";

test("returns the shopping intent generated from a natural-language request", async () => {
  const model = new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            productTypes: ["running shoes"],
            useCases: ["road running"],
            features: ["breathable"],
            category: "Footwear",
            minPriceMinor: null,
            maxPriceMinor: 500000,
            size: "UK 9",
            inStockOnly: true,
            attributes: { support: "Neutral" },
          }),
        },
      ],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: {
          total: 20,
          noCache: 20,
          cacheRead: 0,
          cacheWrite: 0,
        },
        outputTokens: { total: 30, text: 30, reasoning: 0 },
      },
      warnings: [],
    }),
  });

  const interpreter = createAiIntentInterpreter(model);

  assert.deepEqual(
    await interpreter.interpret(
      "I need breathable road-running shoes under ₹5,000 in UK 9",
    ),
    {
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
  );
});

test("rejects an incomplete retrieval intent", async () => {
  const model = new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            productTypes: ["running shoes"],
            features: ["breathable"],
            category: "Footwear",
            minPriceMinor: null,
            maxPriceMinor: 500000,
          }),
        },
      ],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: {
          total: 20,
          noCache: 20,
          cacheRead: 0,
          cacheWrite: 0,
        },
        outputTokens: { total: 30, text: 30, reasoning: 0 },
      },
      warnings: [],
    }),
  });

  const interpreter = createAiIntentInterpreter(model);

  await assert.rejects(
    interpreter.interpret("I need breathable road-running shoes"),
  );
});
