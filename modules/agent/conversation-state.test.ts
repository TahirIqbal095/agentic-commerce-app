import assert from "node:assert/strict";
import test from "node:test";
import type { CheckoutReadiness } from "@/modules/cart/checkout-readiness";
import { transcriptEntryFromMessage } from "./conversation-state";
import { checkoutReadinessActionEntry } from "./customer-action-entry";

const messageId = "51000000-0000-4000-8000-000000000001";

const readiness: CheckoutReadiness = {
  status: "READY",
  cart: {
    id: "31000000-0000-4000-8000-000000000001",
    version: 4,
    items: [
      {
        productId: "11000000-0000-4000-8000-000000000001",
        productName: "Quiet Buds",
        quantity: 2,
        cartPriceMinor: 349900,
        subtotalMinor: 699800,
      },
    ],
    totalQuantity: 2,
    subtotalMinor: 699800,
    currency: "INR",
  },
  blockers: [],
};

test("a recorded Review for checkout reloads as a Customer Action Entry", () => {
  const entry = transcriptEntryFromMessage({
    id: messageId,
    ...checkoutReadinessActionEntry(readiness),
  });

  assert.deepEqual(entry, {
    id: messageId,
    action: "CHECKOUT_READINESS",
    message: "Review my Cart for checkout",
    provenance: "GENERATED",
    readiness,
  });
});

test("a completed Conversation Turn reloads with its Agent outcome", () => {
  const outcome = {
    status: "COMPLETED",
    conversationId: "41000000-0000-4000-8000-000000000001",
    message: "Here are three options.",
    products: [],
  };

  const entry = transcriptEntryFromMessage({
    id: messageId,
    content: "Show me running shoes",
    metadata: { agentOutcome: outcome },
  });

  assert.deepEqual(entry, {
    id: messageId,
    customerMessage: "Show me running shoes",
    result: outcome,
    error: null,
  });
});

test("an unavailable Conversation Turn reloads as a retryable failure", () => {
  const entry = transcriptEntryFromMessage({
    id: messageId,
    content: "Show me running shoes",
    metadata: {
      agentOutcome: {
        status: "TEMPORARILY_UNAVAILABLE",
        message: "The Commerce Agent is temporarily unavailable.",
        retryable: true,
        products: [],
      },
    },
  });

  assert.deepEqual(entry, {
    id: messageId,
    customerMessage: "Show me running shoes",
    result: null,
    error: "The Commerce Agent is temporarily unavailable.",
  });
});
