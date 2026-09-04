import type { CatalogProduct } from "../catalog/types";
import type { CartView } from "../cart/cart";
import type { CheckoutPreparation } from "../checkout/checkout-proposal";
import type { IntentBrief, ShoppingIntent } from "./intent";

export type CompletedAgentOutcome = {
  status: "COMPLETED";
  conversationId: string;
  message: string;
  intentBrief: IntentBrief;
  products: CatalogProduct[];
  intent?: never;
  cart?: CartView;
  /**
   * The deterministic checkout the Storefront prepared for this Turn.
   *
   * The Commerce Agent may recognize that a Customer asked to check out and
   * explain what happens next, but the proposal itself — its lines, its
   * amounts, its policy result, its expiry — is calculated by the checkout
   * authority, never by the model.
   */
  checkout?: CheckoutPreparation;
};

export type NeedsInputAgentOutcome = {
  status: "NEEDS_INPUT";
  conversationId: string;
  message: string;
  question: string;
  missingInformation: string[];
  intentBrief: IntentBrief;
  products: CatalogProduct[];
  intent?: never;
  cart?: CartView;
  cartItemError?: { productId: string; message: string };
  checkout?: never;
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
  checkout?: never;
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
  checkout?: never;
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
