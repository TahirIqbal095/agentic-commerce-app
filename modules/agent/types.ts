import { CatalogProduct } from "../catalog/types";

export type AgentMessage = {
  conversationId?: string;
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
