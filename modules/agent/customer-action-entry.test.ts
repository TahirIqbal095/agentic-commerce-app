import assert from "node:assert/strict";
import test from "node:test";
import type { CheckoutReadiness } from "@/modules/cart/checkout-readiness";
import {
  CHECKOUT_READINESS_ACTION_MESSAGE,
  checkoutReadinessActionEntry,
  isCustomerActionEntry,
  parseCustomerActionEntry,
} from "./customer-action-entry";

const messageId = "51000000-0000-4000-8000-000000000001";

const readyReadiness: CheckoutReadiness = {
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

const emptyReadiness: CheckoutReadiness = {
  status: "NOT_READY",
  cart: {
    id: null,
    version: 0,
    items: [],
    totalQuantity: 0,
    subtotalMinor: 0,
    currency: "INR",
  },
  blockers: [
    {
      code: "CART_EMPTY",
      message: "Add at least one Product to the Cart before checkout.",
    },
  ],
};

test("a persisted Review for checkout entry reloads with its generated provenance and readiness card", () => {
  const { content, metadata } = checkoutReadinessActionEntry(readyReadiness);

  const entry = parseCustomerActionEntry({ id: messageId, content, metadata });

  assert.deepEqual(entry, {
    id: messageId,
    action: "CHECKOUT_READINESS",
    message: CHECKOUT_READINESS_ACTION_MESSAGE,
    provenance: "GENERATED",
    readiness: readyReadiness,
  });
  assert.equal(entry && isCustomerActionEntry(entry), true);
});

test("the entry text is fixed rather than authored from the readiness result", () => {
  const ready = checkoutReadinessActionEntry(readyReadiness);
  const notReady = checkoutReadinessActionEntry(emptyReadiness);

  assert.equal(ready.content, CHECKOUT_READINESS_ACTION_MESSAGE);
  assert.equal(notReady.content, CHECKOUT_READINESS_ACTION_MESSAGE);
  assert.deepEqual(
    parseCustomerActionEntry({ id: messageId, ...notReady })?.readiness,
    emptyReadiness,
  );
});

test("a Customer-authored message is never reloaded as a Customer Action Entry", () => {
  const entry = parseCustomerActionEntry({
    id: messageId,
    content: "What is in my Cart?",
    metadata: { agentOutcome: { status: "COMPLETED" } },
  });

  assert.equal(entry, null);
  assert.equal(
    isCustomerActionEntry({
      id: messageId,
      customerMessage: "What is in my Cart?",
      result: null,
      error: null,
    }),
    false,
  );
});

test("a stored action without its readiness card is not reloaded as an entry", () => {
  const entry = parseCustomerActionEntry({
    id: messageId,
    content: CHECKOUT_READINESS_ACTION_MESSAGE,
    metadata: { customerAction: { type: "CHECKOUT_READINESS" } },
  });

  assert.equal(entry, null);
});
