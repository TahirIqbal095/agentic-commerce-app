export type ShoppingAttributes = Record<string, string | number | boolean>;

export type ShoppingIntent = {
  productTypes: string[];
  useCases: string[];
  features: string[];
  category: string | null;
  minPriceMinor: number | null;
  maxPriceMinor: number | null;
  size: string | null;
  inStockOnly: boolean;
  attributes: ShoppingAttributes;
};

export const PRODUCT_CONSTRAINT_KEYS = [
  "productTypes",
  "useCases",
  "features",
  "category",
  "minPriceMinor",
  "maxPriceMinor",
  "size",
  "inStockOnly",
  "attributes",
] as const;

export type ProductConstraintKey = (typeof PRODUCT_CONSTRAINT_KEYS)[number];

export type ProductConstraintDelta = {
  set: Partial<ShoppingIntent>;
  clear: ProductConstraintKey[];
};

export type RecommendationReference = {
  productId: string;
  name: string;
  description: string;
  category: string;
};

export const CONVERSATION_CONTEXT_SCHEMA_VERSION = 2 as const;

export type ConversationContext = {
  schemaVersion: typeof CONVERSATION_CONTEXT_SCHEMA_VERSION;
  revision: number;
  productConstraints: ShoppingIntent;
  latestRecommendationSet: RecommendationReference[];
};

export type IntentAnalysis = {
  goal: string;
  constraintDelta: ProductConstraintDelta;
  knownEntities: Array<{
    type: "PRODUCT" | "PRODUCT_TYPE" | "CATEGORY";
    value: string;
  }>;
  missingInformation: string[];
  confidence: number;
  requestedEffects: Array<
    | "DISCOVER_PRODUCTS"
    | "ADD_TO_CART"
    | "INSPECT_CART"
    | "CHANGE_CART_QUANTITY"
    | "REMOVE_FROM_CART"
  >;
  referencedProductIds?: string[];
  requestedQuantity?: number;
  requestedAdditions?: RequestedCartAddition[];
  requestedCartItemReference?: string;
  requestedCartQuantityChange?: RequestedCartQuantityChange;
};

export type RequestedCartAddition = {
  productId: string;
  quantity: number;
};

export type RequestedCartQuantityChange = {
  mode: "RELATIVE" | "EXACT";
  quantity: number;
};

export type AddToCartIntent = {
  action: "ADD_TO_CART";
  productName: string;
  quantity: number;
};

export type CommerceIntent = ShoppingIntent | AddToCartIntent;

export type IntentBrief = {
  goal: string;
  constraints: ShoppingIntent;
  knownEntities: Array<{
    type: "PRODUCT" | "PRODUCT_TYPE" | "CATEGORY";
    value: string;
  }>;
  missingInformation: string[];
  confidence: number;
  requestedEffects: Array<
    | "DISCOVER_PRODUCTS"
    | "ADD_TO_CART"
    | "INSPECT_CART"
    | "CHANGE_CART_QUANTITY"
    | "REMOVE_FROM_CART"
  >;
  referencedProductIds?: string[];
  requestedQuantity?: number;
  requestedAdditions?: RequestedCartAddition[];
  requestedCartItemReference?: string;
  requestedCartQuantityChange?: RequestedCartQuantityChange;
  hasUnresolvedProductReferences?: true;
  hasConflictingCartRequest?: true;
};

export interface IntentAnalyzer {
  analyze(input: {
    context: ConversationContext;
    message: string;
  }): Promise<IntentAnalysis>;
}

export interface IntentInterpreter {
  interpret(message: string): Promise<CommerceIntent>;
}

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
    schemaVersion: CONVERSATION_CONTEXT_SCHEMA_VERSION,
    revision: 0,
    productConstraints: structuredClone(CLEAR_VALUES),
    latestRecommendationSet: [],
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
      "latestRecommendationSet",
    ]) ||
    context.schemaVersion !== CONVERSATION_CONTEXT_SCHEMA_VERSION ||
    !Number.isSafeInteger(context.revision) ||
    Number(context.revision) < 0 ||
    !isShoppingIntent(context.productConstraints) ||
    !isRecommendationSet(context.latestRecommendationSet)
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

  if (
    delta.set.productTypes &&
    context.productConstraints.productTypes.length > 0 &&
    productTypeFamily(delta.set.productTypes) !==
      productTypeFamily(context.productConstraints.productTypes) &&
    !sameStrings(
      delta.set.productTypes,
      context.productConstraints.productTypes,
    )
  ) {
    const nextFamily = productTypeFamily(delta.set.productTypes);
    for (const key of ["category", "size", "attributes"] as const) {
      if (!Object.hasOwn(delta.set, key)) {
        if (key === "attributes") {
          productConstraints.attributes = Object.fromEntries(
            Object.entries(productConstraints.attributes).filter(
              ([attribute, value]) =>
                isCompatibleConstraint(
                  `${attribute} ${String(value)}`,
                  nextFamily,
                ),
            ),
          );
        } else {
          assignConstraint(
            productConstraints,
            key,
            structuredClone(CLEAR_VALUES[key]),
          );
        }
      }
    }
    if (!Object.hasOwn(delta.set, "features")) {
      productConstraints.features = productConstraints.features.filter(
        (feature) => isCompatibleConstraint(feature, nextFamily),
      );
    }
  }

  for (const key of delta.clear) {
    assignConstraint(
      productConstraints,
      key,
      structuredClone(CLEAR_VALUES[key]),
    );
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
    throw new Error(
      "The Product constraint delta produces invalid constraints.",
    );
  }

  return {
    schemaVersion: CONVERSATION_CONTEXT_SCHEMA_VERSION,
    revision: context.revision + 1,
    productConstraints,
    latestRecommendationSet: context.latestRecommendationSet,
  };
}

const PRODUCT_TYPE_FAMILIES = new Map<string, string>([
  ["boot", "footwear"],
  ["boots", "footwear"],
  ["sandal", "footwear"],
  ["sandals", "footwear"],
  ["shoe", "footwear"],
  ["shoes", "footwear"],
  ["sneaker", "footwear"],
  ["sneakers", "footwear"],
  ["blouse", "apparel"],
  ["blouses", "apparel"],
  ["shirt", "apparel"],
  ["shirts", "apparel"],
  ["top", "apparel"],
  ["tops", "apparel"],
  ["earbud", "electronics"],
  ["earbuds", "electronics"],
  ["headphone", "electronics"],
  ["headphones", "electronics"],
  ["speaker", "electronics"],
  ["speakers", "electronics"],
]);

const FAMILY_SPECIFIC_CONSTRAINTS = new Map<string, string>([
  ["arch", "footwear"],
  ["cushioning", "footwear"],
  ["heel", "footwear"],
  ["lace", "footwear"],
  ["laces", "footwear"],
  ["lace-up", "footwear"],
  ["sole", "footwear"],
  ["support", "footwear"],
  ["sleeve", "apparel"],
  ["sleeves", "apparel"],
  ["neckline", "apparel"],
  ["bluetooth", "electronics"],
  ["impedance", "electronics"],
  ["noise-cancelling", "electronics"],
  ["wireless", "electronics"],
]);

const CROSS_PRODUCT_CONSTRAINTS = new Set([
  "breathable",
  "color",
  "comfortable",
  "comfort",
  "durable",
  "eco-friendly",
  "lightweight",
  "material",
  "recycled",
  "sustainable",
  "water-resistant",
  "waterproof",
]);

function isCompatibleConstraint(
  constraint: string,
  nextFamily: string,
): boolean {
  const words = constraint
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9-]+/);
  if (words.some((word) => CROSS_PRODUCT_CONSTRAINTS.has(word))) return true;
  return constraintFamily(constraint) === nextFamily;
}

function constraintFamily(constraint: string): string | null {
  const normalized = constraint.trim().toLowerCase();
  return (
    FAMILY_SPECIFIC_CONSTRAINTS.get(normalized) ??
    normalized
      .split(/[^a-z0-9-]+/)
      .map((word) => FAMILY_SPECIFIC_CONSTRAINTS.get(word))
      .find(Boolean) ??
    null
  );
}

function productTypeFamily(productTypes: string[]): string {
  const normalized = productTypes
    .map((productType) => productType.trim().toLowerCase())
    .sort();
  const recognizedFamilies = new Set(
    normalized.flatMap((productType) => {
      const words = productType.split(/\s+/);
      const family = words
        .map((word) => PRODUCT_TYPE_FAMILIES.get(word))
        .find(Boolean);
      return family ? [family] : [];
    }),
  );
  return recognizedFamilies.size === 1
    ? [...recognizedFamilies][0]
    : normalized.join("|");
}

function isRecommendationSet(
  value: unknown,
): value is RecommendationReference[] {
  return (
    Array.isArray(value) &&
    value.length <= 8 &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        hasExactlyKeys(item as Record<string, unknown>, [
          "productId",
          "name",
          "description",
          "category",
        ]) &&
        isBoundedString((item as RecommendationReference).productId) &&
        isBoundedString((item as RecommendationReference).name) &&
        isBoundedString((item as RecommendationReference).description) &&
        isBoundedString((item as RecommendationReference).category),
    )
  );
}

function sameStrings(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function haveConsistentProductSelections(
  referencedProductIds: unknown,
  requestedAdditions: unknown,
): boolean {
  if (referencedProductIds === undefined || requestedAdditions === undefined) {
    return true;
  }
  if (!Array.isArray(referencedProductIds) || !Array.isArray(requestedAdditions)) {
    return false;
  }
  const referencedIds = referencedProductIds.filter(
    (productId): productId is string => typeof productId === "string",
  );
  const additionIds = requestedAdditions.flatMap((item) =>
    typeof item === "object" && item !== null &&
      typeof (item as Record<string, unknown>).productId === "string"
      ? [(item as Record<string, string>).productId]
      : [],
  );
  const referencedIdSet = new Set(referencedIds);
  const additionIdSet = new Set(additionIds);
  return referencedIds.length === referencedProductIds.length &&
    additionIds.length === requestedAdditions.length &&
    referencedIdSet.size === additionIdSet.size &&
    [...referencedIdSet].every((id) => additionIdSet.has(id));
}

export function resolveIntentBrief(
  analysis: IntentAnalysis,
  context: ConversationContext,
): IntentBrief {
  const currentRecommendationIds = new Set(
    context.latestRecommendationSet.map((item) => item.productId),
  );
  const referencedProductIds = analysis.referencedProductIds?.filter((id) =>
    currentRecommendationIds.has(id),
  );
  const requestedAdditions = analysis.requestedAdditions?.filter(
    ({ productId }) => currentRecommendationIds.has(productId),
  );
  const requestedProductIds = [
    ...(analysis.referencedProductIds ?? []),
    ...(analysis.requestedAdditions?.map(({ productId }) => productId) ?? []),
  ];
  const hasConflictingCartRequest =
    !haveConsistentProductSelections(
      analysis.referencedProductIds,
      analysis.requestedAdditions,
    ) ||
    (analysis.requestedQuantity !== undefined &&
      analysis.requestedAdditions !== undefined);
  return {
    goal: analysis.goal,
    constraints: context.productConstraints,
    knownEntities: analysis.knownEntities,
    missingInformation: analysis.missingInformation,
    confidence: analysis.confidence,
    requestedEffects: analysis.requestedEffects,
    ...(referencedProductIds?.length ? { referencedProductIds } : {}),
    ...(analysis.requestedQuantity === undefined
      ? {}
      : { requestedQuantity: analysis.requestedQuantity }),
    ...(requestedAdditions?.length ? { requestedAdditions } : {}),
    ...(analysis.requestedCartItemReference === undefined
      ? {}
      : { requestedCartItemReference: analysis.requestedCartItemReference }),
    ...(analysis.requestedCartQuantityChange === undefined
      ? {}
      : { requestedCartQuantityChange: analysis.requestedCartQuantityChange }),
    ...(requestedProductIds.some((id) => !currentRecommendationIds.has(id))
      ? { hasUnresolvedProductReferences: true as const }
      : {}),
    ...(hasConflictingCartRequest
      ? { hasConflictingCartRequest: true as const }
      : {}),
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

export function isShoppingIntent(value: unknown): value is ShoppingIntent {
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
    Array.isArray(value) && value.length <= 8 && value.every(isBoundedString)
  );
}

function isBoundedString(value: unknown): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= 160
  );
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
          (typeof attribute === "number" && Number.isFinite(attribute)) ||
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
