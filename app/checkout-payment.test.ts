import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import {
  ORDER_ID,
  openStorefront,
  preparedEntry,
  readyCart,
  statusView,
} from "./_test/checkout";
import type { CheckoutStatusView } from "@/modules/checkout/checkout-status";

function browser() {
  return new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });
}

const APPROVED = "Approve and pay ₹15,997 with Razorpay Test Checkout";

const capturedPayment = {
  outcome: "COMPLETED" as const,
  paymentId: "pay_TEST0000000001",
  providerOrderId: "order_TEST0000000001",
  signature: "a-server-verified-signature",
};

function timeline(
  entries: Array<[string, string, string?]>,
): CheckoutStatusView["timeline"] {
  return entries.map(([title, explanation, detail], index) => ({
    id: `audit-${index}`,
    occurredAt: new Date(1_800_000_000_000 + index * 1000).toISOString(),
    title,
    explanation,
    detail: detail ?? null,
  }));
}

const paidTimeline = timeline([
  ["Checkout prepared", "A checkout was prepared for the exact Cart total.", "Cart version 4"],
  ["You approved the amount", "You approved this exact amount for Razorpay Test Checkout."],
  ["Order created", "An Order was created from the approved proposal."],
  ["Razorpay Test Mode asked to create the payment", "Asked Razorpay Test Mode to create the payment.", "Receipt 81000000"],
  ["Razorpay Test Mode created the payment", "Razorpay Test Mode created the payment.", "Payment reference order_TEST0000000001"],
  ["Razorpay Test Checkout opened", "Razorpay Test Checkout opened (attempt 1 of 3)."],
  ["Razorpay captured the test payment", "Razorpay captured this test payment."],
  ["Order paid", "This Order is paid in Razorpay Test Mode. No real money moved and no inventory was reserved."],
]);

/** Drives a Customer from a prepared proposal to whatever the payment produced. */
async function approveAndPay(
  t: Parameters<typeof openStorefront>[0],
  options: {
    launch: () => Awaited<ReturnType<NonNullable<Parameters<typeof openStorefront>[2]>["launch"] & object>>;
    afterCallback: CheckoutStatusView;
  },
) {
  const dom = browser();
  const opened = await openStorefront(t, dom, {
    launch: options.launch,
    routes: {
      proposal: () => Response.json({ data: preparedEntry() }),
      approval: () => Response.json({ data: statusView() }),
      paymentAttempt: () =>
        Response.json({
          data: {
            status: "OPENED",
            attemptId: "91000000-0000-4000-8000-000000000001",
            attemptNumber: 1,
            keyId: "rzp_test_examplekey",
            providerOrderId: "order_TEST0000000001",
            amountMinor: readyCart.subtotalMinor,
            currency: "INR",
            checkout: statusView({ status: "PAYMENT_PENDING", launchesUsed: 1, launchesRemaining: 2 }),
          },
        }),
      callback: () => Response.json({ data: options.afterCallback }),
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

test("approving opens managed Razorpay Test Checkout against the verified payment", async (t) => {
  const { view, launches, requests } = await approveAndPay(t, {
    launch: () => capturedPayment,
    afterCallback: statusView({ status: "PAID", launchesUsed: 1, launchesRemaining: 2, timeline: paidTimeline }),
  });

  await view.findByText("Paid in Razorpay Test Mode");
  assert.deepEqual(launches, [
    {
      orderId: ORDER_ID,
      keyId: "rzp_test_examplekey",
      providerOrderId: "order_TEST0000000001",
      amountMinor: 1599700,
      currency: "INR",
      brandName: "Arc",
    },
  ]);
  assert.deepEqual(requests.slice(2), [
    "POST /api/checkout/proposal",
    "POST /api/checkout/approval",
    `POST /api/checkout/${ORDER_ID}/payment-attempt`,
    `POST /api/checkout/${ORDER_ID}/callback`,
  ]);
});

test("a captured payment shows the Checkout Timeline in the order things happened", async (t) => {
  const { view, within } = await approveAndPay(t, {
    launch: () => capturedPayment,
    afterCallback: statusView({ status: "PAID", launchesUsed: 1, launchesRemaining: 2, timeline: paidTimeline }),
  });

  const timelineRegion = await view.findByRole("region", {
    name: "Checkout timeline",
  });
  const steps = within(timelineRegion).getAllByRole("listitem");
  assert.deepEqual(
    steps.map((step) => within(step).getByRole("heading").textContent),
    paidTimeline.map((entry) => entry.title),
  );
  assert.ok(
    within(timelineRegion).getByText(
      "This Order is paid in Razorpay Test Mode. No real money moved and no inventory was reserved.",
    ),
  );
});

test("technical detail on the timeline is collapsed until a Customer opens it", async (t) => {
  const { view, within } = await approveAndPay(t, {
    launch: () => capturedPayment,
    afterCallback: statusView({ status: "PAID", timeline: paidTimeline }),
  });

  const timelineRegion = await view.findByRole("region", {
    name: "Checkout timeline",
  });
  const details = within(timelineRegion).getAllByRole("group");
  assert.ok(details.length > 0);
  for (const detail of details) {
    assert.equal(detail.hasAttribute("open"), false);
  }
  assert.equal(within(timelineRegion).queryByText(/rzp_test|Basic |signature/), null);
});

test("closing Razorpay Test Checkout is recorded as a dismissal, not a failed charge", async (t) => {
  const dismissedTimeline = timeline([
    ["Razorpay Test Checkout opened", "Razorpay Test Checkout opened (attempt 1 of 3)."],
    ["You closed Razorpay Test Checkout", "You closed Razorpay Test Checkout. No charge was attempted."],
  ]);
  const { view, within } = await approveAndPay(t, {
    launch: () => ({ outcome: "DISMISSED" as const }),
    afterCallback: statusView({
      status: "PAYMENT_PENDING",
      launchesUsed: 1,
      launchesRemaining: 2,
      timeline: dismissedTimeline,
    }),
  });

  const card = await view.findByRole("region", { name: "Checkout status" });
  assert.ok(
    within(card).getByText("You closed Razorpay Test Checkout. No charge was attempted."),
  );
  assert.equal(within(card).queryByText(/failed charge|payment failed/i), null);
  assert.ok(
    within(card).getByRole("button", {
      name: "Try Razorpay Test Checkout again",
    }),
  );
  assert.ok(within(card).getByText("2 of 3 attempts remaining"));
});

test("a Customer may retry against the same payment without approving again", async (t) => {
  const { view, within, user, launches, requests } = await approveAndPay(t, {
    launch: () => ({ outcome: "DISMISSED" as const }),
    afterCallback: statusView({
      status: "PAYMENT_PENDING",
      launchesUsed: 1,
      launchesRemaining: 2,
      timeline: timeline([["You closed Razorpay Test Checkout", "No charge was attempted."]]),
    }),
  });

  const card = await view.findByRole("region", { name: "Checkout status" });
  await user.click(
    within(card).getByRole("button", { name: "Try Razorpay Test Checkout again" }),
  );

  assert.equal(launches.length, 2);
  assert.equal(
    requests.filter((request) => request === "POST /api/checkout/approval").length,
    1,
  );
});

test("an Order that exhausted its launches is terminal and invites a fresh start", async (t) => {
  const { view, within } = await approveAndPay(t, {
    launch: () => ({ outcome: "FAILED" as const, description: "Your test card was declined." }),
    afterCallback: statusView({
      status: "PAYMENT_FAILED",
      launchesUsed: 3,
      launchesRemaining: 0,
      timeline: timeline([
        ["Order could not be paid", "Razorpay Test Checkout was opened 3 times without a captured payment."],
      ]),
    }),
  });

  const card = await view.findByRole("region", { name: "Checkout status" });
  assert.ok(within(card).getByText("Payment not completed"));
  assert.equal(
    within(card).queryByRole("button", {
      name: "Try Razorpay Test Checkout again",
    }),
    null,
  );
  assert.ok(within(card).getByRole("button", { name: "Return to shopping" }));
});

test("every checkout surface repeats that this is Test Mode", async (t) => {
  const { view, within } = await approveAndPay(t, {
    launch: () => capturedPayment,
    afterCallback: statusView({ status: "PAID", timeline: paidTimeline }),
  });

  const card = await view.findByRole("region", { name: "Checkout status" });
  assert.ok(within(card).getByText("Test Mode — no real charge is made."));
  assert.ok(
    within(card).getByText(
      "This checkout reserves no inventory and does not arrange fulfilment.",
    ),
  );
});
