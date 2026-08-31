import type { CatalogProduct } from "../catalog/types";
import type { CartView } from "../cart/cart";
import type { IntentBrief, ShoppingIntent } from "./intent";

export type CompletedAgentOutcome = {
  status: "COMPLETED";
  conversationId: string;
  message: string;
  intentBrief: IntentBrief;
  products: CatalogProduct[];
  intent?: never;
  cart?: CartView;
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

export function isAgentOutcome(value: unknown): value is AgentOutcome {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    ["COMPLETED", "NEEDS_INPUT", "TEMPORARILY_UNAVAILABLE"].includes(
      String(value.status),
    )
  );
}
