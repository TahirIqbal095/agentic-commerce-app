import { google } from "@ai-sdk/google";
import {
  generateText,
  jsonSchema,
  NoObjectGeneratedError,
  Output,
  type JSONSchema7,
  type LanguageModel,
} from "ai";
import {
  applyProductConstraintDelta,
  createEmptyConversationContext,
  IntentAnalysisTimeoutError,
  type IntentAnalysis,
  type IntentAnalyzer,
  isShoppingIntent,
  PRODUCT_CONSTRAINT_KEYS,
  type ShoppingIntent,
} from "./intent";
import { agentModelId, intentAnalyzerConfig } from "@/config/agent/promts";

const shoppingIntentSchema = jsonSchema<ShoppingIntent>(
  {
    type: "object",
    additionalProperties: false,
    required: [
      "productTypes",
      "useCases",
      "features",
      "category",
      "minPriceMinor",
      "maxPriceMinor",
      "size",
      "inStockOnly",
      "attributes",
    ],
    properties: {
      productTypes: {
        type: "array",
        items: { type: "string", minLength: 1 },
        maxItems: 8,
        description:
          "The requested product type plus close retail synonyms and subtypes.",
      },
      useCases: {
        type: "array",
        items: { type: "string", minLength: 1 },
        maxItems: 8,
        description:
          "Activities or situations the product should suit, without product-type synonyms.",
      },
      features: {
        type: "array",
        items: { type: "string", minLength: 1 },
        maxItems: 8,
        description: "Capabilities or qualities the customer cares about.",
      },
      category: {
        type: ["string", "null"],
        description: "A broad catalog category, or null when uncertain.",
      },
      minPriceMinor: {
        type: ["integer", "null"],
        minimum: 0,
        description: "Minimum price in minor currency units, or null.",
      },
      maxPriceMinor: {
        type: ["integer", "null"],
        minimum: 0,
        description:
          "Inclusive maximum price in paise, or null. A bare Customer amount such as 2000 means ₹2,000 INR and therefore 200000 paise.",
      },
      size: {
        type: ["string", "null"],
        description: "The requested Product size such as UK 9, or null.",
      },
      inStockOnly: {
        type: "boolean",
        description:
          "True unless the customer explicitly asks to include unavailable products.",
      },
      attributes: {
        type: "object",
        additionalProperties: {
          type: ["string", "number", "boolean"],
        },
        description:
          "Other explicit structured requirements using lowerCamelCase keys.",
      },
    },
  },
  {
    validate(value) {
      if (!isShoppingIntent(value)) {
        return {
          success: false,
          error: new Error("The model returned an invalid commerce intent."),
        };
      }

      return { success: true, value };
    },
  },
);

const shoppingConstraintSchema = shoppingIntentSchema.jsonSchema as JSONSchema7;

const intentAnalysisSchema = jsonSchema<IntentAnalysis>(
  {
    type: "object",
    additionalProperties: false,
    required: [
      "goal",
      "constraintDelta",
      "knownEntities",
      "missingInformation",
      "confidence",
      "requestedEffects",
    ],
    properties: {
      goal: { type: "string", minLength: 1, maxLength: 240 },
      constraintDelta: {
        type: "object",
        additionalProperties: false,
        required: ["set", "clear"],
        properties: {
          set: {
            type: "object",
            additionalProperties: false,
            properties: shoppingConstraintSchema.properties,
          },
          clear: {
            type: "array",
            uniqueItems: true,
            maxItems: PRODUCT_CONSTRAINT_KEYS.length,
            items: {
              type: "string",
              enum: [...PRODUCT_CONSTRAINT_KEYS],
            },
          },
        },
      },
      knownEntities: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["type", "value"],
          properties: {
            type: {
              type: "string",
              enum: ["PRODUCT", "PRODUCT_TYPE", "CATEGORY"],
            },
            value: { type: "string", minLength: 1, maxLength: 160 },
          },
        },
      },
      missingInformation: {
        type: "array",
        maxItems: 8,
        items: { type: "string", minLength: 1, maxLength: 160 },
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      requestedEffects: {
        type: "array",
        uniqueItems: true,
        maxItems: 3,
        items: {
          type: "string",
          enum: [
            "DISCOVER_PRODUCTS",
            "PRESENT_ADD_CONTROLS",
            "INSPECT_CART",
            "START_CHECKOUT",
          ],
        },
      },
      referencedProductIds: {
        type: "array",
        uniqueItems: true,
        maxItems: 8,
        items: { type: "string", minLength: 1, maxLength: 160 },
        description:
          "Product IDs resolved from references to the latest ordered Recommendation Set. Use current ordering for phrases such as 'the second one'.",
      },
    },
  },
  {
    validate(value) {
      if (!isIntentAnalysis(value)) {
        return {
          success: false,
          error: new Error("The model returned an invalid Intent Analysis."),
        };
      }
      return { success: true, value };
    },
  },
);

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 8 &&
    value.every((item) => typeof item === "string" && item.trim().length > 0)
  );
}

function isIntentAnalysis(value: unknown): value is IntentAnalysis {
  if (typeof value !== "object" || value === null) return false;
  const brief = value as Record<string, unknown>;
  const knownEntityTypes = new Set(["PRODUCT", "PRODUCT_TYPE", "CATEGORY"]);
  const requestedEffects = new Set([
    "DISCOVER_PRODUCTS",
    "PRESENT_ADD_CONTROLS",
    "INSPECT_CART",
    "START_CHECKOUT",
  ]);

  return (
    hasRequiredAndAllowedKeys(
      brief,
      [
        "goal",
        "constraintDelta",
        "knownEntities",
        "missingInformation",
        "confidence",
        "requestedEffects",
      ],
      ["referencedProductIds"],
    ) &&
    typeof brief.goal === "string" &&
    brief.goal.trim().length > 0 &&
    brief.goal.length <= 240 &&
    isConstraintDelta(brief.constraintDelta) &&
    Array.isArray(brief.knownEntities) &&
    brief.knownEntities.length <= 12 &&
    brief.knownEntities.every((entity) => {
      if (typeof entity !== "object" || entity === null) return false;
      const candidate = entity as Record<string, unknown>;
      return (
        hasExactlyKeys(candidate, ["type", "value"]) &&
        knownEntityTypes.has(String(candidate.type)) &&
        typeof candidate.value === "string" &&
        candidate.value.trim().length > 0 &&
        candidate.value.length <= 160
      );
    }) &&
    isStringArray(brief.missingInformation) &&
    typeof brief.confidence === "number" &&
    brief.confidence >= 0 &&
    brief.confidence <= 1 &&
    Array.isArray(brief.requestedEffects) &&
    brief.requestedEffects.length <= 4 &&
    new Set(brief.requestedEffects).size === brief.requestedEffects.length &&
    brief.requestedEffects.every((effect) =>
      requestedEffects.has(String(effect)),
    ) &&
    (brief.referencedProductIds === undefined ||
      (isStringArray(brief.referencedProductIds) &&
        new Set(brief.referencedProductIds).size ===
          brief.referencedProductIds.length))
  );
}

function isConstraintDelta(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const delta = value as Record<string, unknown>;
  if (!hasExactlyKeys(delta, ["set", "clear"])) return false;
  try {
    applyProductConstraintDelta(
      createEmptyConversationContext(),
      delta as IntentAnalysis["constraintDelta"],
    );
    return true;
  } catch {
    return false;
  }
}

function hasExactlyKeys(
  value: Record<string, unknown>,
  expectedKeys: string[],
): boolean {
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(value, key))
  );
}

function hasRequiredAndAllowedKeys(
  value: Record<string, unknown>,
  requiredKeys: string[],
  optionalKeys: string[],
): boolean {
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  return (
    requiredKeys.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

/**
 * How long one Conversation Turn may spend resolving its Intent Brief.
 *
 * The analysis was previously unbounded and was measured at 69 seconds against
 * a degraded model, which a Customer experiences as a Turn that may never
 * finish. The budget covers the retry too, so a malformed first answer cannot
 * double a Customer's wait.
 */
export const INTENT_ANALYSIS_TIMEOUT_MS = 15_000;

export function createAiIntentAnalyzer(
  model: LanguageModel = google(agentModelId()),
  timeoutMs: number = INTENT_ANALYSIS_TIMEOUT_MS,
): IntentAnalyzer {
  return {
    async analyze(input) {
      const deadline = Date.now() + timeoutMs;
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await withinDeadline(deadline, (abortSignal) =>
            generateText({
              model,
              system: intentAnalyzerConfig.prompt,
              prompt: JSON.stringify({
                conversationContext: input.context,
                newestCustomerMessage: input.message,
              }),
              output: Output.object({
                name: intentAnalyzerConfig.name,
                description: intentAnalyzerConfig.description,
                schema: intentAnalysisSchema,
              }),
              abortSignal,
            }).then(({ output }) => output),
          );
        } catch (error) {
          if (
            attempt === 0 &&
            NoObjectGeneratedError.isInstance(error) &&
            Date.now() < deadline
          ) {
            continue;
          }
          throw error;
        }
      }
    },
  };
}

/**
 * Runs one analysis attempt against the Turn's remaining time.
 *
 * The deadline is the Storefront's own rather than the provider's: the
 * provider is asked to stop, and the Turn stops waiting whether or not it
 * does.
 *
 * @throws {IntentAnalysisTimeoutError} When the remaining time runs out.
 */
async function withinDeadline<Result>(
  deadline: number,
  run: (signal: AbortSignal) => Promise<Result>,
): Promise<Result> {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) throw new IntentAnalysisTimeoutError();

  const controller = new AbortController();
  let rejectTimeout: (reason: Error) => void = () => {};
  const timedOut = new Promise<never>((_resolve, reject) => {
    rejectTimeout = reject;
  });
  // The deadline is not unref'd: it is the only thing that ends a Turn whose
  // provider never answers, and it is always cleared below.
  const timeout = setTimeout(() => {
    controller.abort();
    rejectTimeout(new IntentAnalysisTimeoutError());
  }, remainingMs);

  try {
    return await Promise.race([run(controller.signal), timedOut]);
  } finally {
    clearTimeout(timeout);
  }
}
