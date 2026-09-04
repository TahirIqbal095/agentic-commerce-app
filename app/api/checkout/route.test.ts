import assert from "node:assert/strict";
import test from "node:test";
import {
  CHECKOUT_ACTION_MESSAGE,
  type CheckoutActionEntry,
} from "@/modules/agent/customer-action-entry";
import type {
  CheckoutAuthority,
  PaymentAttemptTicket,
} from "@/modules/checkout/checkout-authority";
import type { CheckoutPreparation } from "@/modules/checkout/checkout-proposal";
import type { CheckoutStatusView } from "@/modules/checkout/checkout-status";
import type {
  GuestSession,
  GuestSessionStore,
} from "@/modules/identity/guest-session";
import {
  createCheckoutApprovalRoute,
  createCheckoutCallbackRoute,
  createCheckoutProposalRoute,
  createCheckoutReconcileRoute,
  createCheckoutStatusRoute,
  createPaymentAttemptRoute,
} from "./route-factory";

const PROPOSAL_ID = "61000000-0000-4000-8000-000000000001";
const ORDER_ID = "71000000-0000-4000-8000-000000000001";
const COMMAND_KEY = "a1000000-0000-4000-8000-000000000001";
const APPROVAL_KEY = "a2000000-0000-4000-8000-000000000002";
const ATTEMPT_ID = "91000000-0000-4000-8000-000000000001";

function memoryGuestSessionStore(): GuestSessionStore {
  const sessionsByTokenHash = new Map<string, GuestSession>();
  let created = 0;
  return {
    async findActive(tokenHash) {
      return sessionsByTokenHash.get(tokenHash) ?? null;
    },
    async create({ tokenHash }) {
      created += 1;
      const session = { id: `guest-session-${created}` };
      sessionsByTokenHash.set(tokenHash, session);
      return session;
    },
    async refresh() {},
  };
}

const preparedProposal: CheckoutPreparation = {
  status: "PREPARED",
  proposal: {
    id: PROPOSAL_ID,
    cartId: "31000000-0000-4000-8000-000000000001",
    cartVersion: 4,
    currency: "INR",
    lines: [],
    itemsSubtotalMinor: 1599700,
    discountMinor: 0,
    shippingMinor: 0,
    taxMinor: 0,
    checkoutTotalMinor: 1599700,
    policy: {
      result: "REQUIRE_APPROVAL",
      reasonCode: "PAYMENT_REQUIRES_CUSTOMER_APPROVAL",
      explanation: "Payment always needs your explicit approval.",
    },
    status: "ACTIVE",
    preparedAt: "2026-09-04T10:00:00.000Z",
    expiresAt: "2026-09-04T10:10:00.000Z",
  },
};

const checkoutStatus: CheckoutStatusView = {
  orderId: ORDER_ID,
  status: "PAYMENT_SETUP",
  currency: "INR",
  totalMinor: 1599700,
  providerOperation: {
    status: "SUCCEEDED",
    reconciliationReadsUsed: 0,
    canCheckStatus: false,
  },
  providerOrder: {
    providerOrderId: "order_TEST0000000001",
    amountMinor: 1599700,
    currency: "INR",
    keyId: "rzp_test_examplekey",
  },
  launchesUsed: 0,
  launchesRemaining: 3,
  timeline: [],
};

function fakeAuthority(overrides: Partial<CheckoutAuthority> = {}) {
  const calls: Array<{ operation: string; input: unknown }> = [];
  const authority: CheckoutAuthority = {
    async prepare(command) {
      calls.push({ operation: "prepare", input: command });
      return preparedProposal;
    },
    async approve(command) {
      calls.push({ operation: "approve", input: command });
      return { status: "APPROVED", checkout: checkoutStatus };
    },
    async readStatus(id) {
      calls.push({ operation: "readStatus", input: id });
      return checkoutStatus;
    },
    async reconcile(id) {
      calls.push({ operation: "reconcile", input: id });
      return checkoutStatus;
    },
    async openPaymentAttempt(id) {
      calls.push({ operation: "openPaymentAttempt", input: id });
      return {
        status: "OPENED",
        attemptId: ATTEMPT_ID,
        attemptNumber: 1,
        keyId: "rzp_test_examplekey",
        providerOrderId: "order_TEST0000000001",
        amountMinor: 1599700,
        currency: "INR",
        checkout: checkoutStatus,
      } satisfies PaymentAttemptTicket;
    },
    async resolvePaymentAttempt(id, attemptId, result) {
      calls.push({
        operation: "resolvePaymentAttempt",
        input: { id, attemptId, result },
      });
      return checkoutStatus;
    },
    ...overrides,
  };
  return { authority, calls };
}

function recordingState() {
  const recorded: CheckoutPreparation[] = [];
  return {
    recorded,
    state: {
      async recordCheckout(
        preparation: CheckoutPreparation,
      ): Promise<CheckoutActionEntry> {
        recorded.push(preparation);
        return {
          id: "51000000-0000-4000-8000-000000000001",
          action: "CHECKOUT",
          message: CHECKOUT_ACTION_MESSAGE,
          provenance: "GENERATED",
          preparation,
        };
      },
    },
  };
}

function post(url: string, body?: unknown, cookie?: string) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const orderContext = { params: Promise.resolve({ orderId: ORDER_ID }) };

/** Builds the reconcile route over one authority, the only thing that varies. */
function reconcileRoute(authority: CheckoutAuthority) {
  return createCheckoutReconcileRoute({
    store: memoryGuestSessionStore(),
    createAuthority: () => authority,
  });
}

test("preparing a checkout records the entry the Transcript will show", async () => {
  const { authority, calls } = fakeAuthority();
  const { state, recorded } = recordingState();
  const route = createCheckoutProposalRoute({
    store: memoryGuestSessionStore(),
    createAuthority: () => authority,
    createState: () => state,
  });

  const response = await route(
    post("http://localhost/api/checkout/proposal", { commandKey: COMMAND_KEY }),
  );

  assert.equal(response.status, 200);
  const payload = (await response.json()) as { data: CheckoutActionEntry };
  assert.equal(payload.data.action, "CHECKOUT");
  assert.equal(payload.data.message, CHECKOUT_ACTION_MESSAGE);
  assert.deepEqual(calls, [
    { operation: "prepare", input: { commandKey: COMMAND_KEY } },
  ]);
  assert.deepEqual(recorded, [preparedProposal]);
});

test("the first checkout command issues a Guest Session cookie", async () => {
  const { authority } = fakeAuthority();
  const { state } = recordingState();
  const route = createCheckoutProposalRoute({
    store: memoryGuestSessionStore(),
    createAuthority: () => authority,
    createState: () => state,
  });

  const response = await route(
    post("http://localhost/api/checkout/proposal", { commandKey: COMMAND_KEY }),
  );

  const cookie = response.headers.get("set-cookie") ?? "";
  assert.match(cookie, /guest_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
});

test("a checkout command without a valid command key is refused", async () => {
  const { authority, calls } = fakeAuthority();
  const { state } = recordingState();
  const route = createCheckoutProposalRoute({
    store: memoryGuestSessionStore(),
    createAuthority: () => authority,
    createState: () => state,
  });

  for (const body of [{}, { commandKey: "not-a-uuid" }, undefined]) {
    const response = await route(
      post("http://localhost/api/checkout/proposal", body),
    );
    assert.equal(response.status, 400);
    const payload = (await response.json()) as { error: { code: string } };
    assert.equal(payload.error.code, "INVALID_CHECKOUT_COMMAND");
  }
  assert.deepEqual(calls, []);
});

test("an Approval carries the proposal, its amount, and its idempotency key", async () => {
  const { authority, calls } = fakeAuthority();
  const route = createCheckoutApprovalRoute({
    store: memoryGuestSessionStore(),
    createAuthority: () => authority,
  });

  const response = await route(
    post("http://localhost/api/checkout/approval", {
      proposalId: PROPOSAL_ID,
      approvalKey: APPROVAL_KEY,
      approvedTotalMinor: 1599700,
      currency: "INR",
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()) as unknown, {
    data: checkoutStatus,
  });
  assert.deepEqual(calls[0], {
    operation: "approve",
    input: {
      proposalId: PROPOSAL_ID,
      approvalKey: APPROVAL_KEY,
      approvedTotalMinor: 1599700,
      currency: "INR",
    },
  });
});

test("an Approval missing its amount or key never reaches the authority", async () => {
  const { authority, calls } = fakeAuthority();
  const route = createCheckoutApprovalRoute({
    store: memoryGuestSessionStore(),
    createAuthority: () => authority,
  });

  for (const body of [
    { approvalKey: APPROVAL_KEY, approvedTotalMinor: 1, currency: "INR" },
    { proposalId: PROPOSAL_ID, approvedTotalMinor: 1, currency: "INR" },
    { proposalId: PROPOSAL_ID, approvalKey: APPROVAL_KEY, currency: "INR" },
    {
      proposalId: PROPOSAL_ID,
      approvalKey: APPROVAL_KEY,
      approvedTotalMinor: 0,
      currency: "INR",
    },
  ]) {
    const response = await route(
      post("http://localhost/api/checkout/approval", body),
    );
    assert.equal(response.status, 400);
  }
  assert.deepEqual(calls, []);
});

test("a refused Approval is projected as its own reason, not an internal error", async () => {
  const { authority } = fakeAuthority({
    async approve() {
      return {
        status: "REFUSED",
        reasonCode: "APPROVAL_REVALIDATION_FAILED",
        message: "Your Cart changed after this proposal.",
      };
    },
  });
  const route = createCheckoutApprovalRoute({
    store: memoryGuestSessionStore(),
    createAuthority: () => authority,
  });

  const response = await route(
    post("http://localhost/api/checkout/approval", {
      proposalId: PROPOSAL_ID,
      approvalKey: APPROVAL_KEY,
      approvedTotalMinor: 1599700,
      currency: "INR",
    }),
  );

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: {
      code: "APPROVAL_REVALIDATION_FAILED",
      message: "Your Cart changed after this proposal.",
      details: {},
    },
  });
});

test("an authority failure is answered as an internal error without detail", async () => {
  const { authority } = fakeAuthority({
    async approve() {
      throw new Error("the database is on fire");
    },
  });
  const route = createCheckoutApprovalRoute({
    store: memoryGuestSessionStore(),
    createAuthority: () => authority,
  });

  const response = await route(
    post("http://localhost/api/checkout/approval", {
      proposalId: PROPOSAL_ID,
      approvalKey: APPROVAL_KEY,
      approvedTotalMinor: 1599700,
      currency: "INR",
    }),
  );

  assert.equal(response.status, 500);
  const body = await response.text();
  assert.equal(body.includes("database is on fire"), false);
});

test("a checkout another Guest Session owns is answered 404", async () => {
  const { authority } = fakeAuthority({
    async readStatus() {
      return null;
    },
  });
  const route = createCheckoutStatusRoute({
    store: memoryGuestSessionStore(),
    createAuthority: () => authority,
  });

  const response = await route(
    new Request(`http://localhost/api/checkout/${ORDER_ID}`),
    orderContext,
  );

  assert.equal(response.status, 404);
});

test("reading a checkout returns its authoritative state and its timeline", async () => {
  const timeline = [
    {
      id: "audit-1",
      occurredAt: "2026-09-04T10:00:00.000Z",
      title: "Checkout prepared",
      explanation: "A checkout was prepared for the exact Cart total.",
      detail: "Cart version 4",
    },
  ];
  const { authority, calls } = fakeAuthority({
    async readStatus(id) {
      calls.push({ operation: "readStatus", input: id });
      return { ...checkoutStatus, orderId: id, timeline };
    },
  });
  const route = createCheckoutStatusRoute({
    store: memoryGuestSessionStore(),
    createAuthority: () => authority,
  });

  const response = await route(
    new Request(`http://localhost/api/checkout/${ORDER_ID}`),
    orderContext,
  );

  assert.equal(response.status, 200);
  const payload = (await response.json()) as { data: CheckoutStatusView };
  assert.equal(payload.data.orderId, ORDER_ID);
  assert.deepEqual(payload.data.timeline, timeline);
  assert.deepEqual(calls, [{ operation: "readStatus", input: ORDER_ID }]);
});

test("a checkout identifier that is not a UUID never reaches the authority", async () => {
  const { authority, calls } = fakeAuthority();
  const route = createCheckoutStatusRoute({
    store: memoryGuestSessionStore(),
    createAuthority: () => authority,
  });

  const response = await route(
    new Request("http://localhost/api/checkout/not-a-uuid"),
    { params: Promise.resolve({ orderId: "not-a-uuid" }) },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(calls, []);
});

test("reconciliation spends one bounded read and returns what it learned", async () => {
  const reconciled: CheckoutStatusView = {
    ...checkoutStatus,
    providerOperation: {
      status: "SUCCEEDED",
      reconciliationReadsUsed: 2,
      canCheckStatus: false,
    },
  };
  const { authority, calls } = fakeAuthority({
    async reconcile(id) {
      calls.push({ operation: "reconcile", input: id });
      return reconciled;
    },
  });
  const response = await reconcileRoute(authority)(
    post(`http://localhost/api/checkout/${ORDER_ID}/reconcile`),
    orderContext,
  );

  assert.equal(response.status, 200);
  const payload = (await response.json()) as { data: CheckoutStatusView };
  assert.deepEqual(payload.data, reconciled);
  assert.deepEqual(calls, [{ operation: "reconcile", input: ORDER_ID }]);
});

test("a reconciliation for a checkout this browser does not own is 404", async () => {
  const { authority } = fakeAuthority({
    async reconcile() {
      return {
        status: "REFUSED",
        reasonCode: "ORDER_NOT_FOUND",
        message: "That checkout is not available.",
      };
    },
  });
  const response = await reconcileRoute(authority)(
    post(`http://localhost/api/checkout/${ORDER_ID}/reconcile`),
    orderContext,
  );

  assert.equal(response.status, 404);
  const payload = (await response.json()) as { error: { code: string } };
  assert.equal(payload.error.code, "ORDER_NOT_FOUND");
});

test("a reconciliation failure is answered without leaking why", async () => {
  const { authority } = fakeAuthority({
    async reconcile() {
      throw new Error("the provider adapter exploded");
    },
  });
  const response = await reconcileRoute(authority)(
    post(`http://localhost/api/checkout/${ORDER_ID}/reconcile`),
    orderContext,
  );

  assert.equal(response.status, 500);
  assert.equal(
    (await response.text()).includes("the provider adapter exploded"),
    false,
  );
});

test("opening a Payment Attempt returns the publishable key and nothing secret", async () => {
  const { authority } = fakeAuthority();
  const route = createPaymentAttemptRoute({
    store: memoryGuestSessionStore(),
    createAuthority: () => authority,
  });

  const response = await route(
    post(`http://localhost/api/checkout/${ORDER_ID}/payment-attempt`),
    orderContext,
  );

  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /rzp_test_examplekey/);
  assert.equal(body.includes("Basic "), false);
  assert.equal(body.toLowerCase().includes("secret"), false);
});

test("a Payment Attempt beyond the limit is refused with its reason", async () => {
  const { authority } = fakeAuthority({
    async openPaymentAttempt() {
      return {
        status: "REFUSED",
        reasonCode: "PAYMENT_ATTEMPT_LIMIT_REACHED",
        message: "Razorpay Test Checkout can be opened 3 times for one Order.",
      };
    },
  });
  const route = createPaymentAttemptRoute({
    store: memoryGuestSessionStore(),
    createAuthority: () => authority,
  });

  const response = await route(
    post(`http://localhost/api/checkout/${ORDER_ID}/payment-attempt`),
    orderContext,
  );

  assert.equal(response.status, 409);
  const payload = (await response.json()) as { error: { code: string } };
  assert.equal(payload.error.code, "PAYMENT_ATTEMPT_LIMIT_REACHED");
});

test("a callback claim is passed on verbatim for the authority to verify", async () => {
  const { authority, calls } = fakeAuthority();
  const route = createCheckoutCallbackRoute({
    store: memoryGuestSessionStore(),
    createAuthority: () => authority,
  });

  const response = await route(
    post(`http://localhost/api/checkout/${ORDER_ID}/callback`, {
      attemptId: ATTEMPT_ID,
      result: {
        outcome: "COMPLETED",
        paymentId: "pay_TEST1",
        providerOrderId: "order_TEST0000000001",
        signature: "claimed-signature",
      },
    }),
    orderContext,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls[0], {
    operation: "resolvePaymentAttempt",
    input: {
      id: ORDER_ID,
      attemptId: ATTEMPT_ID,
      result: {
        outcome: "COMPLETED",
        paymentId: "pay_TEST1",
        providerOrderId: "order_TEST0000000001",
        signature: "claimed-signature",
      },
    },
  });
});

test("a completed callback missing its identifiers is refused before the authority", async () => {
  const { authority, calls } = fakeAuthority();
  const route = createCheckoutCallbackRoute({
    store: memoryGuestSessionStore(),
    createAuthority: () => authority,
  });

  const response = await route(
    post(`http://localhost/api/checkout/${ORDER_ID}/callback`, {
      attemptId: ATTEMPT_ID,
      result: { outcome: "COMPLETED", paymentId: "pay_TEST1" },
    }),
    orderContext,
  );

  assert.equal(response.status, 400);
  assert.deepEqual(calls, []);
});

test("a dismissal is a first-class outcome the callback route accepts", async () => {
  const { authority, calls } = fakeAuthority();
  const route = createCheckoutCallbackRoute({
    store: memoryGuestSessionStore(),
    createAuthority: () => authority,
  });

  const response = await route(
    post(`http://localhost/api/checkout/${ORDER_ID}/callback`, {
      attemptId: ATTEMPT_ID,
      result: { outcome: "DISMISSED" },
    }),
    orderContext,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(
    (calls[0].input as { result: unknown }).result,
    { outcome: "DISMISSED" },
  );
});
