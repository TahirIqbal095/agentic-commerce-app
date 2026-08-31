import type { JsonObject } from "@/db/schema/types";
import type { AgentOutcome } from "./agent-outcome";
import type { IntentBrief } from "./intent";

/**
 * Reduces an Intent Brief to the bounded, non-sensitive facts needed for
 * diagnostics and subsequent processing.
 *
 * @param intentBrief - Full Intent Brief produced for the current turn.
 * @returns A copy with canonical goals and generalized private details.
 */
export function minimizeIntentBrief(intentBrief: IntentBrief): IntentBrief {
  return {
    ...intentBrief,
    goal: intentBrief.requestedEffects.includes("INSPECT_CART")
      ? "Inspect Cart"
      : intentBrief.requestedEffects.includes("ADD_TO_CART")
        ? "Change Cart"
        : "Discover Products",
    constraints: {
      ...intentBrief.constraints,
      attributes: {},
    },
    missingInformation:
      intentBrief.missingInformation.length > 0
        ? ["ADDITIONAL_PRODUCT_PREFERENCE"]
        : [],
  };
}

/**
 * Maps an Agent outcome to the canonical durable Transcript message.
 *
 * @param outcome - Typed outcome whose status determines the message.
 * @returns A short, non-sensitive summary of the result.
 */
export function canonicalPersistedMessage(outcome: AgentOutcome): string {
  switch (outcome.status) {
    case "COMPLETED":
      return outcome.cart ? "Cart inspected." : "Product discovery completed.";
    case "NEEDS_INPUT":
      return "Additional Product information requested.";
    case "TEMPORARILY_UNAVAILABLE":
      return "Commerce Agent temporarily unavailable.";
  }
}

/**
 * Builds inspectable, privacy-safe metadata for a completed Agent turn.
 *
 * @param outcome - Full Agent outcome returned to the Customer.
 * @returns JSON metadata suitable for durable message persistence.
 */
export function outcomeMetadata(outcome: AgentOutcome): JsonObject {
  const { products, ...rest } = outcome;
  const minimized = sanitizeRecord({
    ...rest,
    message: canonicalPersistedMessage(outcome),
    ...(outcome.intentBrief
      ? { intentBrief: minimizeIntentBrief(outcome.intentBrief) }
      : {}),
    ...(outcome.status === "NEEDS_INPUT"
      ? {
          question: "What additional Product preference should I use?",
          missingInformation: ["ADDITIONAL_PRODUCT_PREFERENCE"],
        }
      : {}),
  });
  return { agentOutcome: { ...minimized, products } };
}

const privateTraceKeys = new Set([
  "chainofthought",
  "credentials",
  "address",
  "contact",
  "customername",
  "email",
  "fullname",
  "homeaddress",
  "password",
  "personaldata",
  "phone",
  "recipientname",
  "reasoning",
]);

/**
 * Recursively sanitizes a JSON object while preserving its object type.
 *
 * @param record - Metadata object to sanitize.
 * @returns A deep-sanitized JSON object.
 */
export function sanitizeRecord(record: JsonObject): JsonObject {
  return sanitizeValue(record) as JsonObject;
}

/**
 * Recursively redacts sensitive strings and removes private trace fields from
 * an arbitrary value.
 *
 * @param value - Value to sanitize before durable persistence.
 * @returns A sanitized copy; primitive non-string values are returned as-is.
 */
export function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return redactSensitiveText(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (typeof value !== "object" || value === null) return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          !privateTraceKeys.has(key.replaceAll(/[_-]/g, "").toLowerCase()),
      )
      .map(([key, item]) => [key, sanitizeValue(item)]),
  );
}

/**
 * Replaces common personal, payment, credential, address, and private-reasoning
 * patterns with stable redaction markers.
 *
 * @param value - Free-form text that may contain sensitive information.
 * @returns Text safe for durable Conversation persistence.
 */
export function redactSensitiveText(value: string): string {
  return value
    .replace(
      /\b(?:private\s+)?(?:chain[- ]of[- ]thought|reasoning)\s*[:=]\s*[^;.!?]+/gi,
      "[REDACTED_PRIVATE_TRACE]",
    )
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[REDACTED_EMAIL]")
    .replace(/\b[\w.-]{2,}@[A-Za-z][A-Za-z0-9]{1,}\b/g, "[REDACTED_PAYMENT_ID]")
    .replace(
      /\b(?:(?:\d{4}[ -]){3}\d{4}|\d{4}[ -]\d{6}[ -]\d{5}|\d{13,19})\b/g,
      "[REDACTED_PAYMENT_CARD]",
    )
    .replace(
      /\b(?:cvv|cvc|card\s+security\s+code)\b\s*(?::|=|is)?\s*\d{3,4}\b/gi,
      "[REDACTED_CARD_SECURITY_CODE]",
    )
    .replace(
      /\b(?:exp(?:iry|iration)?(?:\s+date)?)\b\s*(?::|=|is)?\s*(?:0?[1-9]|1[0-2])\s*[/-]\s*\d{2,4}\b/gi,
      "[REDACTED_CARD_EXPIRY]",
    )
    .replace(
      /\b(?:phone|mobile|tel(?:ephone)?)\b\s*(?::|=|is)?\s*\+?[\d(). -]{7,24}\d\b/gi,
      "[REDACTED_PHONE]",
    )
    .replace(
      /(?<![\w-])\+?\d{1,3}[ .-]?(?:\(?\d{2,5}\)?[ .-]){1,3}\d{3,5}(?![\w-])/g,
      "[REDACTED_PHONE]",
    )
    .replace(
      /\b(?:(?:flat|apartment|apt|unit|house)\s+[A-Za-z0-9-]+\s*,?\s*)?\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s+){1,6}(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|boulevard|blvd|way|court|ct)\b/gi,
      "[REDACTED_ADDRESS]",
    )
    .replace(
      /\b(?:pin|postal|zip)(?:\s+code)?\b\s*(?::|=|is)?\s*[A-Za-z0-9 -]{3,12}\b/gi,
      "[REDACTED_POSTAL_CODE]",
    )
    .replace(
      /\b(for|recipient|named)\s+[A-Z][a-z]{1,30}\b/g,
      "$1 [REDACTED_PERSON]",
    )
    .replace(
      /\b(?:otp|password|passcode|api[\s_-]?key|access[\s_-]?token|refresh[\s_-]?token|token|secret)\b\s*(?::|=|is)?\s*[^\s,;.!?]+/gi,
      "[REDACTED_CREDENTIAL]",
    )
    .replace(/(?<![-\d])\d{10,19}(?![-\d])/g, "[REDACTED_NUMBER]");
}
