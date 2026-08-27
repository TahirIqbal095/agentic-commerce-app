import { google } from "@ai-sdk/google";
import {
  generateText,
  jsonSchema,
  NoObjectGeneratedError,
  Output,
  type JSONSchema7,
  type LanguageModel,
} from "ai";
import type { IntentInterpreter } from "./commerce-agent";
import type { CommerceIntent, IntentBrief, ShoppingIntent } from "./types";
import {
  intentAnalyzerConfig,
  intentInterpreterConfig,
} from "@/config/agent/promts";

const shoppingIntentSchema = jsonSchema<CommerceIntent>(
  {
    anyOf: [
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
              "Inclusive maximum price in paise, or null. A bare user amount such as 2000 means ₹2,000 INR and therefore 200000 paise.",
          },
          size: {
            type: ["string", "null"],
            description:
              "The requested merchant catalog size such as UK 9, or null.",
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
        type: "object",
        additionalProperties: false,
        required: ["action", "productName", "quantity"],
        properties: {
          action: {
            type: "string",
            const: "ADD_TO_CART",
            description:
              "Use ADD_TO_CART only when the customer explicitly asks to add a product to their cart.",
          },
          productName: {
            type: "string",
            minLength: 1,
            description:
              "The specific product name requested for a cart addition.",
          },
          quantity: {
            type: "integer",
            minimum: 1,
            maximum: 10,
            description: "The quantity requested for the cart addition.",
          },
        },
      },
    ],
  },
  {
    validate(value) {
      if (!isCommerceIntent(value)) {
        return {
          success: false,
          error: new Error("The model returned an invalid commerce intent."),
        };
      }

      return { success: true, value };
    },
  },
);

const intentBriefSchema = jsonSchema<IntentBrief>(
  {
    type: "object",
    additionalProperties: false,
    required: [
      "goal",
      "constraints",
      "knownEntities",
      "missingInformation",
      "confidence",
      "requestedEffects",
    ],
    properties: {
      goal: { type: "string", minLength: 1, maxLength: 240 },
      constraints: (shoppingIntentSchema.jsonSchema as JSONSchema7).anyOf![0],
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
        maxItems: 2,
        items: {
          type: "string",
          enum: ["DISCOVER_PRODUCTS", "ADD_TO_CART"],
        },
      },
    },
  },
  {
    validate(value) {
      if (!isIntentBrief(value)) {
        return {
          success: false,
          error: new Error("The model returned an invalid Intent Brief."),
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

function isOptionalPrice(value: unknown): value is number | null {
  return value === null || (Number.isSafeInteger(value) && Number(value) >= 0);
}

function isOptionalText(value: unknown): value is string | null {
  return (
    value === null || (typeof value === "string" && value.trim().length > 0)
  );
}

function isShoppingAttributes(
  value: unknown,
): value is Record<string, string | number | boolean> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (attribute) =>
        typeof attribute === "string" ||
        typeof attribute === "number" ||
        typeof attribute === "boolean",
    )
  );
}

function isShoppingIntent(value: unknown): value is ShoppingIntent {
  if (typeof value !== "object" || value === null) return false;

  const intent = value as Record<string, unknown>;
  return (
    hasExactlyKeys(intent, [
      "productTypes",
      "useCases",
      "features",
      "category",
      "minPriceMinor",
      "maxPriceMinor",
      "size",
      "inStockOnly",
      "attributes",
    ]) &&
    isStringArray(intent.productTypes) &&
    isStringArray(intent.useCases) &&
    isStringArray(intent.features) &&
    (intent.category === null ||
      (typeof intent.category === "string" &&
        intent.category.trim().length > 0)) &&
    isOptionalPrice(intent.minPriceMinor) &&
    isOptionalPrice(intent.maxPriceMinor) &&
    isOptionalText(intent.size) &&
    typeof intent.inStockOnly === "boolean" &&
    isShoppingAttributes(intent.attributes) &&
    (intent.minPriceMinor === null ||
      intent.maxPriceMinor === null ||
      Number(intent.minPriceMinor) <= Number(intent.maxPriceMinor))
  );
}

function isCommerceIntent(value: unknown): value is CommerceIntent {
  if (isShoppingIntent(value)) return true;
  if (typeof value !== "object" || value === null) return false;

  const intent = value as Record<string, unknown>;
  return (
    intent.action === "ADD_TO_CART" &&
    typeof intent.productName === "string" &&
    intent.productName.trim().length > 0 &&
    Number.isInteger(intent.quantity) &&
    Number(intent.quantity) >= 1 &&
    Number(intent.quantity) <= 10
  );
}

function isIntentBrief(value: unknown): value is IntentBrief {
  if (typeof value !== "object" || value === null) return false;
  const brief = value as Record<string, unknown>;
  const knownEntityTypes = new Set(["PRODUCT", "PRODUCT_TYPE", "CATEGORY"]);
  const requestedEffects = new Set(["DISCOVER_PRODUCTS", "ADD_TO_CART"]);

  return (
    hasExactlyKeys(brief, [
      "goal",
      "constraints",
      "knownEntities",
      "missingInformation",
      "confidence",
      "requestedEffects",
    ]) &&
    typeof brief.goal === "string" &&
    brief.goal.trim().length > 0 &&
    brief.goal.length <= 240 &&
    isShoppingIntent(brief.constraints) &&
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
    brief.requestedEffects.length <= 2 &&
    new Set(brief.requestedEffects).size === brief.requestedEffects.length &&
    brief.requestedEffects.every((effect) => requestedEffects.has(String(effect)))
  );
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

export interface IntentAnalyzer {
  analyze(message: string): Promise<IntentBrief>;
}

export function createAiIntentAnalyzer(
  model: LanguageModel = google(
    process.env.GOOGLE_GENERATIVE_AI_MODEL ?? "gemini-3.5-flash-lite",
  ),
): IntentAnalyzer {
  return {
    async analyze(message) {
      for (let attempt = 0; ; attempt += 1) {
        try {
          const { output } = await generateText({
            model,
            system: intentAnalyzerConfig.prompt,
            prompt: message,
            output: Output.object({
              name: intentAnalyzerConfig.name,
              description: intentAnalyzerConfig.description,
              schema: intentBriefSchema,
            }),
          });
          return output;
        } catch (error) {
          if (attempt === 0 && NoObjectGeneratedError.isInstance(error)) continue;
          throw error;
        }
      }
    },
  };
}

export function createAiIntentInterpreter(
  model: LanguageModel = google(
    process.env.GOOGLE_GENERATIVE_AI_MODEL ?? "gemini-3.5-flash-lite",
  ),
): IntentInterpreter {
  return {
    async interpret(message) {
      const { output } = await generateText({
        model,
        system: intentInterpreterConfig.prompt,
        prompt: message,
        output: Output.object({
          name: intentInterpreterConfig.name,
          description: intentInterpreterConfig.description,
          schema: shoppingIntentSchema,
        }),
      });

      return output;
    },
  };
}
