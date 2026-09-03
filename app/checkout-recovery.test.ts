import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import {
  ORDER_ID,
  openStorefront,
  preparedEntry,
  statusView,
} from "./_test/checkout";
import type { CheckoutStatusView } from "@/modules/checkout/checkout-status";

function browser() {
  return new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
}

const APPROVED = "Approve and pay ₹15,997 with Razorpay Test Checkout";

function step(title: string, explanation: string, detail?: string) {
  return {
    id: title,
    occurredAt: new Date(1_800_000_000_000).toISOString(),
    title,
    explanation,
    detail: detail ?? null,
  };
}

const unknownTimeline = [
  step(
    "Razorpay Test Mode asked to create the payment",
    "Asked Razorpay Test Mode to create the payment for the approved amount.",
    "Receipt 81000000-0000-4000-8000-000000000001",
  ),
  step(
    "Razorpay's answer did not arrive",
    "Razorpay's answer did not arrive, so it is not yet known whether the payment was created. No second payment was requested.",
  ),
  step(
    "Checked what Razorpay actually did",
    "Looked the payment up by its receipt to find out what Razorpay did (check 1 of 3).",
  ),
];

/** The checkout an Unknown Provider Outcome leaves behind, before recovery. */
const unknownOutcome = statusView({
  providerOperation: {
    status: "OUTCOME_UNKNOWN",
    reconciliationReadsUsed: 1,
    canCheckStatus: false,
  },
  providerOrder: null,
  timeline: unknownTimeline,
});

/** The same checkout once reconciliation found the exact Provider Order. */
const recovered = statusView({
  timeline: [
    ...unknownTimeline,
    step(
      "Found the exact payment already created",
      "Razorpay had already created this exact payment, so no second payment was requested.",
      "Payment reference order_TEST0000000001 · receipt 81000000-0000-4000-8000-000000000001",
    ),
  ],
});

async function checkoutWith(
  t: Parameters<typeof openStorefront>[0],
  reconcileResults: CheckoutStatusView[],
  launch: () => { outcome: "DISMISSED" } = () => ({ outcome: "DISMISSED" }),
) {
  const remaining = [...reconcileResults];
  const opened = await openStorefront(t, browser(), {
    launch,
    routes: {
      proposal: () => Response.json({ data: preparedEntry() }),
      approval: () => Response.json({ data: unknownOutcome }),
      reconcile: () =>
        Response.json({ data: remaining.shift() ?? unknownOutcome }),
      paymentAttempt: () =>
        Response.json({
          data: {
            status: "OPENED",
            attemptId: "91000000-0000-4000-8000-000000000001",
            attemptNumber: 1,
            keyId: "rzp_test_examplekey",
            providerOrderId: "order_TEST0000000001",
            amountMinor: 1599700,
            currency: "INR",
            checkout: recovered,
          },
        }),
      callback: () =>
        Response.json({
          data: statusView({ status: "PAYMENT_PENDING", launchesUsed: 1, launchesRemaining: 2, timeline: recovered.timeline }),
        }),
    },
  });

  const drawer = await opened.openCart();
  await opened.user.click(
    opened.within(drawer).getByRole("button", { name: "Check out" }),
  );
  await opened.view.findByRole("region", { name: "Checkout proposal" });
  await opened.user.click(opened.view.getByRole("button", { name: APPROVED }));
  return opened;
}

test("a lost Razorpay answer is shown as unknown, with no second payment requested", async (t) => {
  const { view, within } = await checkoutWith(t, [unknownOutcome]);

  const card = await view.findByRole("region", { name: "Checkout status" });
  assert.ok(
    within(card).getByText(
      "Razorpay\u2019s answer did not arrive, so the Storefront is checking what it actually did. No second payment has been requested.",
    ),
  );
  assert.equal(within(card).queryByText(/failed|declined/i), null);
});

test("reconciliation finds the exact payment and checkout continues without a duplicate", async (t) => {
  const { view, within, requests, launches } = await checkoutWith(t, [
    recovered,
  ]);

  const timeline = await view.findByRole("region", { name: "Checkout timeline" });
  const steps = within(timeline).getAllByRole("listitem");
  assert.deepEqual(
    steps.map((entry) => within(entry).getByRole("heading").textContent),
    [
      "Razorpay Test Mode asked to create the payment",
      "Razorpay's answer did not arrive",
      "Checked what Razorpay actually did",
      "Found the exact payment already created",
    ],
  );
  assert.equal(
    requests.filter((request) => request === "POST /api/checkout/approval").length,
    1,
  );
  assert.equal(
    requests.filter((request) =>
      request.endsWith(`/api/checkout/${ORDER_ID}/reconcile`),
    ).length,
    1,
  );
  assert.equal(launches.length, 1);
});

test("automatic checking stops and hands the Customer a safe status control", async (t) => {
  const stalled = statusView({
    providerOperation: {
      status: "OUTCOME_UNKNOWN",
      reconciliationReadsUsed: 2,
      canCheckStatus: true,
    },
    providerOrder: null,
    timeline: unknownTimeline,
  });
  const { view, within, requests } = await checkoutWith(t, [stalled]);

  const card = await view.findByRole("region", { name: "Checkout status" });
  const check = await within(card).findByRole("button", {
    name: "Check Razorpay status",
  });
  assert.ok(check);
  assert.ok(
    within(card).getByText(
      "This only looks at what Razorpay already has. It never asks for a second payment.",
    ),
  );
  assert.equal(
    requests.filter((request) =>
      request.endsWith(`/api/checkout/${ORDER_ID}/reconcile`),
    ).length,
    1,
  );
});

test("a mismatched reconciled payment stops checkout and explains why", async (t) => {
  const mismatched = statusView({
    providerOperation: {
      status: "FAILED",
      reconciliationReadsUsed: 2,
      canCheckStatus: false,
    },
    providerOrder: null,
    blockedReason:
      "Razorpay returned different payment details, so this checkout was stopped before any payment was requested.",
    timeline: unknownTimeline,
  });
  const { view, within, launches } = await checkoutWith(t, [mismatched]);

  const card = await view.findByRole("region", { name: "Checkout status" });
  assert.ok(
    await within(card).findByText(
      "Razorpay returned different payment details, so this checkout was stopped before any payment was requested.",
    ),
  );
  assert.equal(
    within(card).queryByRole("button", {
      name: "Try Razorpay Test Checkout again",
    }),
    null,
  );
  assert.equal(launches.length, 0);
});
