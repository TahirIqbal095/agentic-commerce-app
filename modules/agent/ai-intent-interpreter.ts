import { google } from "@ai-sdk/google";
import { generateText, jsonSchema, Output, type LanguageModel } from "ai";
import type { IntentInterpreter } from "./commerce-agent";
import type { ShoppingIntent } from "./types";
import { intentInterpreterConfig } from "@/config/agent/promts";

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
    validate(value) {
      if (!isShoppingIntent(value)) {
        return {
          success: false,
          error: new Error("The model returned an invalid shopping intent."),
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
