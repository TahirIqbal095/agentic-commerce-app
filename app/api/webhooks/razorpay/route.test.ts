import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createProviderNotificationRoute } from "./route-factory";
import type { ProviderNotificationFacts } from "@/modules/payments/provider-notification";
import type { NotificationReceipt } from "@/modules/checkout/provider-notification-inbox";
import { readRazorpayTestConfiguration } from "@/modules/payments/razorpay-config";

const WEBHOOK_SECRET = "webhook-secret-value";
const configuration = readRazorpayTestConfiguration({
  RAZORPAY_TEST_KEY_ID: "rzp_test_examplekey",
  RAZORPAY_TEST_KEY_SECRET: "test-secret-value",
  RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
});

const capturedEvent = {
  id: "evt_TEST0000000001",
  event: "payment.captured",
  created_at: 1_800_000_000,
  payload: {
    payment: {
      entity: {
        id: "pay_TEST0000000001",
        order_id: "order_TEST0000000001",
        amount: 1599700,
        currency: "INR",
        status: "captured",
      },
    },
  },
};

function sign(body: string, secret = WEBHOOK_SECRET) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function deliver(
  body: string,
  signature: string | null,
  receive: (facts: ProviderNotificationFacts) => Promise<NotificationReceipt>,
) {
  const route = createProviderNotificationRoute({
    configuration,
    createInbox: () => ({ receive }),
  });
  return route(
    new Request("http://localhost/api/webhooks/razorpay", {
      method: "POST",
      body,
      ...(signature ? { headers: { "x-razorpay-signature": signature } } : {}),
    }),
  );
}

const accept = async (): Promise<NotificationReceipt> => ({
  status: "ACCEPTED",
});

test("an authentic delivery is accepted and its facts are read", async () => {
  const body = JSON.stringify(capturedEvent);
  let received: ProviderNotificationFacts | null = null;

  const response = await deliver(body, sign(body), async (facts) => {
    received = facts;
    return { status: "ACCEPTED" };
  });

  assert.equal(response.status, 200);
  assert.deepEqual(received, {
    eventId: "evt_TEST0000000001",
    eventType: "payment.captured",
    providerOrderId: "order_TEST0000000001",
    providerPaymentId: "pay_TEST0000000001",
    providerStatus: "captured",
    amountMinor: 1599700,
    currency: "INR",
    occurredAt: new Date(1_800_000_000_000),
  });
});

test("a missing signature is refused with 401 and never parsed", async () => {
  const body = JSON.stringify(capturedEvent);
  let reached = false;

  const response = await deliver(body, null, async () => {
    reached = true;
    return { status: "ACCEPTED" };
  });

  assert.equal(response.status, 401);
  assert.equal(reached, false);
});

test("a signature from the wrong secret is refused with 401", async () => {
  const body = JSON.stringify(capturedEvent);

  const response = await deliver(body, sign(body, "not-the-secret"), accept);

  assert.equal(response.status, 401);
});

test("a malformed signature is refused rather than throwing", async () => {
  const body = JSON.stringify(capturedEvent);

  const response = await deliver(body, "not-hexadecimal", accept);

  assert.equal(response.status, 401);
});

test("a signature over different bytes is refused", async () => {
  const body = JSON.stringify(capturedEvent);
  const tampered = JSON.stringify({ ...capturedEvent, id: "evt_OTHER" });

  const response = await deliver(tampered, sign(body), accept);

  assert.equal(response.status, 401);
});

test("an authenticated but unparsable payload is 400, not 401 or 500", async () => {
  const body = "{ not json";

  const response = await deliver(body, sign(body), accept);

  assert.equal(response.status, 400);
});

test("an authenticated payload without an event identity is 400", async () => {
  const body = JSON.stringify({ payload: {} });

  const response = await deliver(body, sign(body), accept);

  assert.equal(response.status, 400);
});

test("a duplicate delivery is answered 2xx so Razorpay stops retrying", async () => {
  const body = JSON.stringify(capturedEvent);

  const response = await deliver(body, sign(body), async () => ({
    status: "DUPLICATE",
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "DUPLICATE" });
});

test("an event held for a Provider Order we do not know yet is still 2xx", async () => {
  const body = JSON.stringify(capturedEvent);

  const response = await deliver(body, sign(body), async () => ({
    status: "HELD",
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "HELD" });
});

test("a durable storage failure is 500 so the delivery is retried", async () => {
  const body = JSON.stringify(capturedEvent);

  const response = await deliver(body, sign(body), async () => {
    throw new Error("database unavailable");
  });

  assert.equal(response.status, 500);
});

test("notifications are refused outright when checkout is not configured", async () => {
  const body = JSON.stringify(capturedEvent);
  const route = createProviderNotificationRoute({
    configuration: {
      status: "DISABLED",
      reasonCode: "RAZORPAY_CREDENTIALS_ABSENT",
      explanation: "Checkout is unavailable.",
    },
    createInbox: () => {
      throw new Error("the inbox must never be reached");
    },
  });

  const response = await route(
    new Request("http://localhost/api/webhooks/razorpay", {
      method: "POST",
      body,
      headers: { "x-razorpay-signature": sign(body) },
    }),
  );

  assert.equal(response.status, 401);
});
