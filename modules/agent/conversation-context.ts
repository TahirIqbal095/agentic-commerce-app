import type {
  ConversationContext,
  IntentAnalysis,
  IntentBrief,
  ProductConstraintDelta,
  ProductConstraintKey,
  ShoppingIntent,
} from "./types";
import { PRODUCT_CONSTRAINT_KEYS } from "./types";

const CLEAR_VALUES: { [Key in ProductConstraintKey]: ShoppingIntent[Key] } = {
  productTypes: [],
  useCases: [],
  features: [],
  category: null,
  minPriceMinor: null,
  maxPriceMinor: null,
  size: null,
  inStockOnly: true,
  attributes: {},
};

export function createEmptyConversationContext(): ConversationContext {
  return {
    schemaVersion: 1,
    revision: 0,
    productConstraints: structuredClone(CLEAR_VALUES),
  };
}

export function parseConversationContext(value: unknown): ConversationContext {
  if (typeof value !== "object" || value === null) {
    throw new Error("Conversation Context must be an object.");
  }
  const context = value as Record<string, unknown>;
  if (
    !hasExactlyKeys(context, [
      "schemaVersion",
      "revision",
      "productConstraints",
    ]) ||
    context.schemaVersion !== 1 ||
    !Number.isSafeInteger(context.revision) ||
    Number(context.revision) < 0 ||
    !isShoppingIntent(context.productConstraints)
  ) {
    throw new Error("Conversation Context is invalid or unsupported.");
  }
  return structuredClone(context) as ConversationContext;
}

export function applyProductConstraintDelta(
  context: ConversationContext,
  delta: ProductConstraintDelta,
): ConversationContext {
  assertProductConstraintDelta(delta);
  const productConstraints = structuredClone(context.productConstraints);

  for (const key of delta.clear) {
    assignConstraint(productConstraints, key, structuredClone(CLEAR_VALUES[key]));
  }
  for (const key of PRODUCT_CONSTRAINT_KEYS) {
    if (Object.hasOwn(delta.set, key)) {
      assignConstraint(
        productConstraints,
        key,
        structuredClone(delta.set[key] as ShoppingIntent[typeof key]),
      );
    }
  }
  if (!isShoppingIntent(productConstraints)) {
    throw new Error("The Product constraint delta produces invalid constraints.");
  }

  return {
    schemaVersion: 1,
    revision: context.revision + 1,
    productConstraints,
  };
}

export function resolveIntentBrief(
  analysis: IntentAnalysis,
  context: ConversationContext,
): IntentBrief {
  return {
    goal: analysis.goal,
    constraints: context.productConstraints,
    knownEntities: analysis.knownEntities,
    missingInformation: analysis.missingInformation,
    confidence: analysis.confidence,
    requestedEffects: analysis.requestedEffects,
  };
}

function assertProductConstraintDelta(delta: ProductConstraintDelta): void {
  if (
    typeof delta !== "object" ||
    delta === null ||
    typeof delta.set !== "object" ||
    delta.set === null ||
    Array.isArray(delta.set) ||
    !Array.isArray(delta.clear)
  ) {
    throw new Error("The Product constraint delta is invalid.");
  }
  const allowedKeys = new Set<string>(PRODUCT_CONSTRAINT_KEYS);
  const setKeys = Object.keys(delta.set);
  if (
    setKeys.some((key) => !allowedKeys.has(key)) ||
    delta.clear.some((key) => !allowedKeys.has(key)) ||
    new Set(delta.clear).size !== delta.clear.length ||
    delta.clear.some((key) => Object.hasOwn(delta.set, key))
  ) {
    throw new Error("The Product constraint delta has conflicting operations.");
  }

  const candidate = {
    ...createEmptyConversationContext().productConstraints,
    ...delta.set,
  };
  if (!isShoppingIntent(candidate)) {
    throw new Error("The Product constraint delta contains invalid values.");
  }
}

function assignConstraint<Key extends ProductConstraintKey>(
  constraints: ShoppingIntent,
  key: Key,
  value: ShoppingIntent[Key],
) {
  constraints[key] = value;
}

function isShoppingIntent(value: unknown): value is ShoppingIntent {
  if (typeof value !== "object" || value === null) return false;
  const intent = value as Record<string, unknown>;
  return (
    hasExactlyKeys(intent, PRODUCT_CONSTRAINT_KEYS) &&
    isStringArray(intent.productTypes) &&
    isStringArray(intent.useCases) &&
    isStringArray(intent.features) &&
    (intent.category === null || isBoundedString(intent.category)) &&
    isOptionalPrice(intent.minPriceMinor) &&
    isOptionalPrice(intent.maxPriceMinor) &&
    (intent.size === null || isBoundedString(intent.size)) &&
    typeof intent.inStockOnly === "boolean" &&
    isShoppingAttributes(intent.attributes) &&
    (intent.minPriceMinor === null ||
      intent.maxPriceMinor === null ||
      Number(intent.minPriceMinor) <= Number(intent.maxPriceMinor))
  );
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 8 &&
    value.every(isBoundedString)
  );
}

function isBoundedString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 160;
}

function isOptionalPrice(value: unknown): value is number | null {
  return value === null || (Number.isSafeInteger(value) && Number(value) >= 0);
}

function isShoppingAttributes(
  value: unknown,
): value is Record<string, string | number | boolean> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const entries = Object.entries(value);
  return (
    entries.length <= 16 &&
    entries.every(
      ([key, attribute]) =>
        key.length > 0 &&
        key.length <= 60 &&
        ((typeof attribute === "string" && attribute.length <= 160) ||
          typeof attribute === "number" ||
          typeof attribute === "boolean"),
    )
  );
}

function hasExactlyKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(value, key))
  );
}
