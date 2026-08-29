import type { CatalogProduct } from "../catalog/types";

export type AgentMessage = {
  conversationId?: string;
  idempotencyKey: string;
  message: string;
};

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

export type ConversationContext = {
  schemaVersion: 2;
  revision: number;
  productConstraints: ShoppingIntent;
  latestRecommendationSet: RecommendationReference[];
};

export type RecommendationReference = {
  productId: string;
  name: string;
  description: string;
  category: string;
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
  requestedEffects: Array<"DISCOVER_PRODUCTS" | "ADD_TO_CART">;
  referencedProductIds?: string[];
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
  requestedEffects: Array<"DISCOVER_PRODUCTS" | "ADD_TO_CART">;
  referencedProductIds?: string[];
};

export type CompletedAgentOutcome = {
  status: "COMPLETED";
  conversationId: string;
  message: string;
  intentBrief: IntentBrief;
  products: CatalogProduct[];
  intent?: never;
  cart?: never;
};

export type NeedsInputAgentOutcome = {
  status: "NEEDS_INPUT";
  conversationId: string;
  message: string;
  question: string;
  missingInformation: string[];
  intentBrief: IntentBrief;
  products: [];
  intent?: never;
  cart?: never;
};

export type TemporarilyUnavailableAgentOutcome = {
  status: "TEMPORARILY_UNAVAILABLE";
  conversationId?: string;
  message: string;
  retryable: true;
  products: [];
  intentBrief?: IntentBrief;
  intent?: never;
  cart?: never;
};

export type AgentOutcome =
  | CompletedAgentOutcome
  | NeedsInputAgentOutcome
  | TemporarilyUnavailableAgentOutcome;

export type AgentResponse = {
  conversationId: string;
  message: string;
  intent?: ShoppingIntent;
  products: CatalogProduct[];
  cart?: {
    id: string;
    totalQuantity: number;
    subtotalMinor: number;
    currency: string;
  };
  status?: never;
  intentBrief?: never;
};

export type ConversationTranscriptTurn = {
  id: string;
  customerMessage: string;
  result: AgentOutcome | null;
  error: string | null;
};

export type CurrentConversation = {
  conversationId: string;
  transcript: ConversationTranscriptTurn[];
  contextSummary: ShoppingIntent;
  revision: number;
};
