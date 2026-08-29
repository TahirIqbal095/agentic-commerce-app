import assert from "node:assert/strict";
import test from "node:test";
import { MockLanguageModelV4 } from "ai/test";
import {
  createAiIntentAnalyzer,
  createAiIntentInterpreter,
} from "./ai-intent-interpreter";
import { createEmptyConversationContext } from "./conversation-context";

test("returns a typed Intent Analysis for Product discovery", async () => {
  const model = new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
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
            knownEntities: [
              { type: "PRODUCT_TYPE", value: "running shoes" },
            ],
            missingInformation: [],
            confidence: 0.94,
            requestedEffects: ["DISCOVER_PRODUCTS"],
          }),
        },
      ],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 20, noCache: 20, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 30, text: 30, reasoning: 0 },
      },
      warnings: [],
    }),
  });

  const analyzer = createAiIntentAnalyzer(model);

  assert.deepEqual(
    await analyzer.analyze({
      context: createEmptyConversationContext(),
      message: "I need breathable road-running shoes under ₹5,000 in UK 9",
    }),
    {
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
    },
  );
});

test("retries malformed Intent Brief output once", async () => {
  let attempts = 0;
  const validAnalysis = {
    goal: "Find desk lamps",
    constraintDelta: {
      set: { productTypes: ["desk lamps"], category: "Lighting" },
      clear: [],
    },
    knownEntities: [{ type: "PRODUCT_TYPE", value: "desk lamps" }],
    missingInformation: [],
    confidence: 0.9,
    requestedEffects: ["DISCOVER_PRODUCTS"],
  };
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      attempts += 1;
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              attempts === 1 ? { goal: "incomplete" } : validAnalysis,
            ),
          },
        ],
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 10, text: 10, reasoning: 0 },
        },
        warnings: [],
      };
    },
  });

  const analyzer = createAiIntentAnalyzer(model);

  assert.deepEqual(
    await analyzer.analyze({
      context: createEmptyConversationContext(),
      message: "show me desk lamps",
    }),
    validAnalysis,
  );
  assert.equal(attempts, 2);
});

test("rejects undeclared private fields in an Intent Brief", async () => {
  let attempts = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      attempts += 1;
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              goal: "Find running shoes",
              constraintDelta: {
                set: {
                  productTypes: ["running shoes"],
                  address: "private address",
                },
                clear: [],
              },
              knownEntities: [
                {
                  type: "PRODUCT_TYPE",
                  value: "running shoes",
                  email: "private@example.com",
                },
              ],
              missingInformation: [],
              confidence: 0.9,
              requestedEffects: ["DISCOVER_PRODUCTS"],
              privateChainOfThought: "hidden reasoning",
            }),
          },
        ],
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 10, text: 10, reasoning: 0 },
        },
        warnings: [],
      };
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

test("returns an add-to-cart intent with the requested product and quantity", async () => {
  const model = new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            action: "ADD_TO_CART",
            productName: "StrideFlow Daily Running Shoes",
            quantity: 2,
          }),
        },
      ],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: {
          total: 12,
          noCache: 12,
          cacheRead: 0,
          cacheWrite: 0,
        },
        outputTokens: { total: 12, text: 12, reasoning: 0 },
      },
      warnings: [],
    }),
  });

  const interpreter = createAiIntentInterpreter(model);

  assert.deepEqual(
    await interpreter.interpret(
      "add two StrideFlow Daily Running Shoes to my cart",
    ),
    {
      action: "ADD_TO_CART",
      productName: "StrideFlow Daily Running Shoes",
      quantity: 2,
    },
  );
});

test("uses a Gemini-compatible response schema for cart requests", async () => {
  const model = new MockLanguageModelV4({
    provider: "google.generative-ai",
    doGenerate: async (options) => {
      assert.equal(options.responseFormat?.type, "json");
      const schema = options.responseFormat?.schema as {
        anyOf?: Array<{
          type?: string;
          required?: string[];
          properties?: Record<string, unknown>;
        }>;
      };

      assert.ok(schema.anyOf);
      for (const branch of schema.anyOf) {
        assert.equal(branch.type, "object");
        assert.ok(branch.properties);
        for (const requiredProperty of branch.required ?? []) {
          assert.ok(requiredProperty in branch.properties);
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              action: "ADD_TO_CART",
              productName: "StrideFlow Daily Running Shoes",
              quantity: 1,
            }),
          },
        ],
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: {
            total: 10,
            noCache: 10,
            cacheRead: 0,
            cacheWrite: 0,
          },
          outputTokens: { total: 10, text: 10, reasoning: 0 },
        },
        warnings: [],
      };
    },
  });

  const interpreter = createAiIntentInterpreter(model);

  await interpreter.interpret(
    "add one StrideFlow Daily Running Shoes to my cart",
  );
});
