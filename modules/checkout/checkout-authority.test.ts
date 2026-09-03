import assert from "node:assert/strict";
import test from "node:test";
import { createCheckoutAuthority } from "./checkout-authority";
import {
  CART_ID,
  GUEST_SESSION_ID,
  enabledRazorpay,
  fakeAuditLog,
  fakeCartReview,
  fakeOrderStore,
  fakeProposalStore,
  fakeProviderGateway,
  providerOrderForRequest,
  reviewableCart,
  type FakeGatewayScript,
} from "./_test/checkout-fakes";
import type { CartWithProductAvailability } from "@/modules/cart/cart-view";
import type { RazorpayTestConfiguration } from "@/modules/payments/razorpay-config";

const COMMAND_KEY = "a1000000-0000-4000-8000-000000000001";
const APPROVAL_KEY = "a2000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-09-04T10:00:00.000Z");

function authorityWith(
  options: {
    cart?: () => CartWithProductAvailability;
    script?: FakeGatewayScript;
    configuration?: RazorpayTestConfiguration;
    clock?: () => Date;
  } = {},
) {
  const proposals = fakeProposalStore();
  const orders = fakeOrderStore();
  const audit = fakeAuditLog();
  const provider = fakeProviderGateway(options.script ?? {});
  let issued = 0;
  const authority = createCheckoutAuthority({
    guestSessionId: GUEST_SESSION_ID,
    brandName: "Arc",
    cartReview: fakeCartReview(options.cart ?? (() => reviewableCart())),
    proposals,
    orders,
    provider: provider.gateway,
    configuration: options.configuration ?? enabledRazorpay,
    audit: audit.log,
    now: options.clock ?? (() => NOW),
    newId: () =>
      `61000000-0000-4000-8000-${String(++issued).padStart(12, "0")}`,
  });
  return { authority, proposals, orders, audit, provider };
}

/** Prepares a proposal and approves it, the ordinary path a Customer takes. */
async function approvedCheckout(script: FakeGatewayScript = {}) {
  const context = authorityWith({ script });
  const preparation = await context.authority.prepare({
    commandKey: COMMAND_KEY,
  });
  if (preparation.status !== "PREPARED") throw new Error("unreachable");
  const approval = await context.authority.approve({
    proposalId: preparation.proposal.id,
    approvalKey: APPROVAL_KEY,
    approvedTotalMinor: preparation.proposal.checkoutTotalMinor,
    currency: "INR",
  });
  if (!("checkout" in approval)) throw new Error("approval was refused");
  return { ...context, proposal: preparation.proposal, checkout: approval.checkout };
}

test("a prepared proposal charges exactly the Cart Subtotal with explicit zeros", async () => {
  const { authority } = authorityWith();

  const preparation = await authority.prepare({ commandKey: COMMAND_KEY });

  assert.equal(preparation.status, "PREPARED");
  if (preparation.status !== "PREPARED") return;
  assert.equal(preparation.proposal.checkoutTotalMinor, 1599700);
  assert.equal(preparation.proposal.itemsSubtotalMinor, 1599700);
  assert.equal(preparation.proposal.discountMinor, 0);
  assert.equal(preparation.proposal.shippingMinor, 0);
  assert.equal(preparation.proposal.taxMinor, 0);
  assert.equal(preparation.proposal.cartVersion, 4);
  assert.equal(preparation.proposal.policy.result, "REQUIRE_APPROVAL");
  assert.equal(
    preparation.proposal.expiresAt,
    new Date(NOW.getTime() + 600_000).toISOString(),
  );
});

test("repeating one Customer command key returns the same proposal", async () => {
  const { authority, proposals } = authorityWith();

  const first = await authority.prepare({ commandKey: COMMAND_KEY });
  const second = await authority.prepare({ commandKey: COMMAND_KEY });

  assert.deepEqual(first, second);
  assert.equal(proposals.proposals.size, 1);
});

test("preparing a proposal invalidates one prepared from an earlier Cart", async () => {
  let version = 4;
  const { authority, proposals } = authorityWith({
    cart: () => reviewableCart({ version }),
  });

  const first = await authority.prepare({ commandKey: COMMAND_KEY });
  version = 5;
  await authority.prepare({
    commandKey: "a1000000-0000-4000-8000-000000000009",
  });

  assert.equal(first.status, "PREPARED");
  if (first.status !== "PREPARED") return;
  assert.equal(
    proposals.proposals.get(first.proposal.id)?.status,
    "INVALIDATED",
  );
});

test("a Cart that is not ready yields the readiness result, never a proposal", async () => {
  const { authority } = authorityWith({
    cart: () =>
      reviewableCart({
        items: [{ ...reviewableCart().items[0], stock: 1, quantity: 2 }],
      }),
  });

  const preparation = await authority.prepare({ commandKey: COMMAND_KEY });

  assert.equal(preparation.status, "NOT_READY");
});

test("a Cart above the checkout total limit is refused with the bound named", async () => {
  const { authority } = authorityWith({
    cart: () =>
      reviewableCart({
        subtotalMinor: 6_000_000,
        items: [
          {
            ...reviewableCart().items[0],
            quantity: 2,
            cartPriceMinor: 3_000_000,
            subtotalMinor: 6_000_000,
          },
        ],
        totalQuantity: 2,
      }),
  });

  const preparation = await authority.prepare({ commandKey: COMMAND_KEY });

  assert.equal(preparation.status, "UNAVAILABLE");
  if (preparation.status !== "UNAVAILABLE") return;
  assert.deepEqual(
    preparation.violations.map((violation) => violation.code),
    ["TOTAL_ABOVE_MAXIMUM"],
  );
});

test("absent Razorpay Test credentials disable checkout with an explanation", async () => {
  const { authority, provider } = authorityWith({
    configuration: {
      status: "DISABLED",
      reasonCode: "RAZORPAY_CREDENTIALS_ABSENT",
      explanation: "Checkout is unavailable.",
    },
  });

  const preparation = await authority.prepare({ commandKey: COMMAND_KEY });

  assert.equal(preparation.status, "UNAVAILABLE");
  assert.deepEqual(provider.calls, []);
});

test("an approved proposal creates exactly one Order, Operation, and Provider Order", async () => {
  const context = authorityWith({});
  const preparation = await context.authority.prepare({
    commandKey: COMMAND_KEY,
  });
  if (preparation.status !== "PREPARED") throw new Error("unreachable");

  const outcome = await context.authority.approve({
    proposalId: preparation.proposal.id,
    approvalKey: APPROVAL_KEY,
    approvedTotalMinor: preparation.proposal.checkoutTotalMinor,
    currency: "INR",
  });

  assert.equal("status" in outcome && outcome.status, "APPROVED");
  if (!("checkout" in outcome)) throw new Error("unreachable");
  assert.equal(context.orders.orders.size, 1);
  assert.equal(context.orders.operations.size, 1);
  assert.equal(context.orders.providerOrders.size, 1);
  assert.equal(outcome.checkout.providerOperation.status, "SUCCEEDED");
  assert.equal(outcome.checkout.providerOrder?.amountMinor, 1599700);
  assert.equal(outcome.checkout.providerOrder?.keyId, "rzp_test_examplekey");
  assert.equal(outcome.checkout.launchesRemaining, 3);
});

test("a repeated Approval submission returns the same Order", async () => {
  const context = authorityWith({});
  const preparation = await context.authority.prepare({
    commandKey: COMMAND_KEY,
  });
  if (preparation.status !== "PREPARED") throw new Error("unreachable");
  const command = {
    proposalId: preparation.proposal.id,
    approvalKey: APPROVAL_KEY,
    approvedTotalMinor: preparation.proposal.checkoutTotalMinor,
    currency: "INR",
  };

  const first = await context.authority.approve(command);
  const second = await context.authority.approve(command);

  assert.equal("status" in first && first.status, "APPROVED");
  assert.equal("status" in second && second.status, "APPROVED");
  assert.equal(context.orders.orders.size, 1);
  assert.equal(
    context.provider.calls.filter((call) => call.tool === "create_order")
      .length,
    1,
  );
});

test("an Approval for a different amount than the proposal is refused", async () => {
  const context = authorityWith({});
  const preparation = await context.authority.prepare({
    commandKey: COMMAND_KEY,
  });
  if (preparation.status !== "PREPARED") throw new Error("unreachable");

  const outcome = await context.authority.approve({
    proposalId: preparation.proposal.id,
    approvalKey: APPROVAL_KEY,
    approvedTotalMinor: 100,
    currency: "INR",
  });

  assert.equal("reasonCode" in outcome && outcome.reasonCode, "APPROVAL_AMOUNT_MISMATCH");
  assert.equal(context.orders.orders.size, 0);
});

test("an Approval after the Cart changed is refused before an Order exists", async () => {
  let cart = reviewableCart();
  const context = authorityWith({ cart: () => cart });
  const preparation = await context.authority.prepare({
    commandKey: COMMAND_KEY,
  });
  if (preparation.status !== "PREPARED") throw new Error("unreachable");
  cart = reviewableCart({ version: 5 });

  const outcome = await context.authority.approve({
    proposalId: preparation.proposal.id,
    approvalKey: APPROVAL_KEY,
    approvedTotalMinor: preparation.proposal.checkoutTotalMinor,
    currency: "INR",
  });

  assert.equal(
    "reasonCode" in outcome && outcome.reasonCode,
    "APPROVAL_REVALIDATION_FAILED",
  );
  assert.equal(context.orders.orders.size, 0);
  assert.deepEqual(context.provider.calls, []);
});

test("an Approval after the proposal expired is refused", async () => {
  let clock = NOW;
  const context = authorityWith({ clock: () => clock });
  const preparation = await context.authority.prepare({
    commandKey: COMMAND_KEY,
  });
  if (preparation.status !== "PREPARED") throw new Error("unreachable");
  clock = new Date(NOW.getTime() + 601_000);

  const outcome = await context.authority.approve({
    proposalId: preparation.proposal.id,
    approvalKey: APPROVAL_KEY,
    approvedTotalMinor: preparation.proposal.checkoutTotalMinor,
    currency: "INR",
  });

  assert.equal(
    "reasonCode" in outcome && outcome.reasonCode,
    "APPROVAL_REVALIDATION_FAILED",
  );
  assert.equal(context.orders.orders.size, 0);
});

test("an Approval for a Product that went out of stock is refused", async () => {
  let cart = reviewableCart();
  const context = authorityWith({ cart: () => cart });
  const preparation = await context.authority.prepare({
    commandKey: COMMAND_KEY,
  });
  if (preparation.status !== "PREPARED") throw new Error("unreachable");
  cart = reviewableCart({
    items: reviewableCart().items.map((item, index) =>
      index === 0 ? { ...item, stock: 0 } : item,
    ),
  });

  const outcome = await context.authority.approve({
    proposalId: preparation.proposal.id,
    approvalKey: APPROVAL_KEY,
    approvedTotalMinor: preparation.proposal.checkoutTotalMinor,
    currency: "INR",
  });

  assert.equal(
    "reasonCode" in outcome && outcome.reasonCode,
    "APPROVAL_REVALIDATION_FAILED",
  );
  assert.equal(context.orders.orders.size, 0);
});

test("a proposal owned by another Guest Session cannot be approved", async () => {
  const context = authorityWith({});

  const outcome = await context.authority.approve({
    proposalId: "61000000-0000-4000-8000-000000000999",
    approvalKey: APPROVAL_KEY,
    approvedTotalMinor: 1599700,
    currency: "INR",
  });

  assert.equal(
    "reasonCode" in outcome && outcome.reasonCode,
    "CHECKOUT_PROPOSAL_NOT_FOUND",
  );
});

test("the Provider Order's receipt is the Provider Operation, and notes bind it", async () => {
  const context = authorityWith({});
  const preparation = await context.authority.prepare({
    commandKey: COMMAND_KEY,
  });
  if (preparation.status !== "PREPARED") throw new Error("unreachable");
  await context.authority.approve({
    proposalId: preparation.proposal.id,
    approvalKey: APPROVAL_KEY,
    approvedTotalMinor: preparation.proposal.checkoutTotalMinor,
    currency: "INR",
  });

  const [operation] = [...context.orders.operations.values()];
  const [order] = [...context.orders.orders.values()];
  const [create] = context.provider.calls;
  assert.deepEqual(create.input, {
    amountMinor: 1599700,
    currency: "INR",
    receipt: operation.id,
    notes: {
      orderId: order.id,
      proposalId: preparation.proposal.id,
      cartVersion: "4",
      environment: "TEST",
    },
  });
  assert.equal(
    JSON.stringify(create.input).includes(GUEST_SESSION_ID),
    false,
  );
  assert.equal(JSON.stringify(create.input).includes(CART_ID), false);
});

test("a lost response is reconciled by receipt and never written a second time", async () => {
  const { checkout, provider, orders } = await approvedCheckout({
    createOrder: [
      {
        status: "OUTCOME_UNKNOWN",
        reasonCode: "PROVIDER_RESPONSE_LOST",
        message: "Razorpay's answer did not arrive.",
      },
    ],
    findByReceipt: [
      (receipt) => ({
        status: "FOUND",
        value: providerOrderForRequest({
          amountMinor: 1599700,
          currency: "INR",
          receipt,
          notes: {
            orderId: "",
            proposalId: "",
            cartVersion: "4",
            environment: "TEST",
          },
        }),
      }),
    ],
  });

  // The reconciled order must carry this Order's own binding notes to match,
  // so a bare receipt hit is not enough.
  assert.equal(checkout.providerOperation.status, "FAILED");
  assert.equal(
    provider.calls.filter((call) => call.tool === "create_order").length,
    1,
  );
  assert.equal(orders.providerOrders.size, 0);
});

test("an exact reconciled Provider Order recovers the checkout without duplicating it", async () => {
  const context = authorityWith({});
  const preparation = await context.authority.prepare({
    commandKey: COMMAND_KEY,
  });
  if (preparation.status !== "PREPARED") throw new Error("unreachable");

  const recovering = authorityWith({});
  void recovering;
  const lost = fakeProviderGateway({});
  void lost;

  // Re-run with a script whose receipt lookup mirrors the dispatched request.
  let dispatched: { receipt: string; notes: Record<string, string> } | null =
    null;
  const replay = authorityWith({
    script: {
      createOrder: [
        (input) => {
          dispatched = { receipt: input.receipt, notes: input.notes };
          return {
            status: "OUTCOME_UNKNOWN",
            reasonCode: "PROVIDER_RESPONSE_LOST",
            message: "Razorpay's answer did not arrive.",
          };
        },
      ],
      findByReceipt: [
        () => ({
          status: "FOUND",
          value: providerOrderForRequest({
            amountMinor: 1599700,
            currency: "INR",
            receipt: dispatched!.receipt,
            notes: dispatched!.notes,
          }),
        }),
      ],
    },
  });
  const replayed = await replay.authority.prepare({ commandKey: COMMAND_KEY });
  if (replayed.status !== "PREPARED") throw new Error("unreachable");
  const outcome = await replay.authority.approve({
    proposalId: replayed.proposal.id,
    approvalKey: APPROVAL_KEY,
    approvedTotalMinor: replayed.proposal.checkoutTotalMinor,
    currency: "INR",
  });

  if (!("checkout" in outcome)) throw new Error("approval was refused");
  assert.equal(outcome.checkout.providerOperation.status, "SUCCEEDED");
  assert.equal(outcome.checkout.providerOperation.reconciliationReadsUsed, 1);
  assert.equal(replay.orders.providerOrders.size, 1);
  assert.equal(
    replay.provider.calls.filter((call) => call.tool === "create_order").length,
    1,
  );
});

test("confirmed absence permits one more attempt with identical inputs", async () => {
  const { checkout, provider, orders } = await approvedCheckout({
    createOrder: [
      {
        status: "OUTCOME_UNKNOWN",
        reasonCode: "PROVIDER_RESPONSE_LOST",
        message: "Razorpay's answer did not arrive.",
      },
    ],
    findByReceipt: [{ status: "ABSENT" }],
  });

  const creates = provider.calls.filter((call) => call.tool === "create_order");
  assert.equal(creates.length, 2);
  assert.deepEqual(creates[0].input, creates[1].input);
  assert.equal(checkout.providerOperation.status, "SUCCEEDED");
  assert.equal(orders.providerOrders.size, 1);
});

test("reconciliation reads are capped at three", async () => {
  const unresolved = {
    status: "UNAVAILABLE" as const,
    reasonCode: "PROVIDER_UNREACHABLE",
    message: "Razorpay could not be reached.",
  };
  const { checkout, authority, provider } = await approvedCheckout({
    createOrder: [
      {
        status: "OUTCOME_UNKNOWN",
        reasonCode: "PROVIDER_RESPONSE_LOST",
        message: "Razorpay's answer did not arrive.",
      },
    ],
    findByReceipt: [unresolved, unresolved, unresolved, unresolved, unresolved],
  });

  let latest = checkout;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const next = await authority.reconcile(latest.orderId);
    if (!("timeline" in next)) throw new Error("reconcile was refused");
    latest = next;
  }

  assert.equal(latest.providerOperation.reconciliationReadsUsed, 3);
  assert.equal(
    provider.calls.filter((call) => call.tool === "fetch_all_orders").length,
    3,
  );
  assert.equal(latest.providerOperation.canCheckStatus, false);
});

test("a mismatched Provider Order stops checkout before any payment opens", async () => {
  const { checkout, authority } = await approvedCheckout({
    createOrder: [
      (input) => ({
        status: "SUCCEEDED",
        providerOrder: providerOrderForRequest(input, { amountMinor: 100 }),
      }),
    ],
  });

  assert.equal(checkout.providerOperation.status, "FAILED");
  assert.match(checkout.blockedReason ?? "", /different payment details/);

  const attempt = await authority.openPaymentAttempt(checkout.orderId);
  assert.equal(
    "reasonCode" in attempt && attempt.reasonCode,
    "PROVIDER_ORDER_UNVERIFIED",
  );
});

test("managed Checkout may be opened at most three times for one Order", async () => {
  const { checkout, authority } = await approvedCheckout();

  const opened: string[] = [];
  for (let launch = 0; launch < 4; launch += 1) {
    const ticket = await authority.openPaymentAttempt(checkout.orderId);
    if ("attemptId" in ticket) {
      opened.push(ticket.attemptId);
      await authority.resolvePaymentAttempt(checkout.orderId, ticket.attemptId, {
        outcome: "DISMISSED",
      });
    } else {
      assert.equal(ticket.reasonCode, "PAYMENT_ATTEMPT_LIMIT_REACHED");
    }
  }

  assert.equal(opened.length, 3);
});

test("an Order becomes PAYMENT_FAILED only once every launch is spent", async () => {
  const { checkout, authority, orders } = await approvedCheckout();

  for (let launch = 0; launch < 3; launch += 1) {
    const ticket = await authority.openPaymentAttempt(checkout.orderId);
    if (!("attemptId" in ticket)) throw new Error("launch was refused");
    const after = await authority.resolvePaymentAttempt(
      checkout.orderId,
      ticket.attemptId,
      { outcome: "DISMISSED" },
    );
    if (!("status" in after)) throw new Error("unreachable");
    assert.equal(
      after.status,
      launch === 2 ? "PAYMENT_FAILED" : "PAYMENT_PENDING",
    );
  }
  assert.equal(
    [...orders.orders.values()][0].status,
    "PAYMENT_FAILED",
  );
});

test("an unverifiable browser callback never marks an Order paid", async () => {
  const { checkout, authority, orders } = await approvedCheckout({
    payment: {
      status: "FOUND",
      value: {
        providerPaymentId: "pay_TEST1",
        providerOrderId: "order_TEST1",
        amountMinor: 1599700,
        currency: "INR",
        status: "captured",
        captured: true,
      },
    },
  });
  const ticket = await authority.openPaymentAttempt(checkout.orderId);
  if (!("attemptId" in ticket)) throw new Error("launch was refused");

  const outcome = await authority.resolvePaymentAttempt(
    checkout.orderId,
    ticket.attemptId,
    {
      outcome: "COMPLETED",
      paymentId: "pay_TEST1",
      providerOrderId: ticket.providerOrderId,
      signature: "forged-signature",
    },
  );

  assert.equal(
    "reasonCode" in outcome && outcome.reasonCode,
    "PAYMENT_CALLBACK_UNVERIFIED",
  );
  assert.notEqual([...orders.orders.values()][0].status, "PAID");
});

test("an Order is paid only from Razorpay's own captured state", async () => {
  const { checkout, authority, orders } = await approvedCheckout({
    payment: {
      status: "FOUND",
      value: {
        providerPaymentId: "pay_TEST1",
        providerOrderId: "order_TEST1",
        amountMinor: 1599700,
        currency: "INR",
        status: "captured",
        captured: true,
      },
    },
  });
  const ticket = await authority.openPaymentAttempt(checkout.orderId);
  if (!("attemptId" in ticket)) throw new Error("launch was refused");

  const outcome = await authority.resolvePaymentAttempt(
    checkout.orderId,
    ticket.attemptId,
    {
      outcome: "COMPLETED",
      paymentId: "pay_TEST1",
      providerOrderId: ticket.providerOrderId,
      signature: "valid-signature",
    },
  );

  assert.equal("status" in outcome && outcome.status, "PAID");
  assert.equal([...orders.orders.values()][0].status, "PAID");
});

test("a verified callback Razorpay has not captured leaves the Order unpaid", async () => {
  const { checkout, authority, orders } = await approvedCheckout({
    payment: {
      status: "FOUND",
      value: {
        providerPaymentId: "pay_TEST1",
        providerOrderId: "order_TEST1",
        amountMinor: 1599700,
        currency: "INR",
        status: "failed",
        captured: false,
      },
    },
  });
  const ticket = await authority.openPaymentAttempt(checkout.orderId);
  if (!("attemptId" in ticket)) throw new Error("launch was refused");

  const outcome = await authority.resolvePaymentAttempt(
    checkout.orderId,
    ticket.attemptId,
    {
      outcome: "COMPLETED",
      paymentId: "pay_TEST1",
      providerOrderId: ticket.providerOrderId,
      signature: "valid-signature",
    },
  );

  assert.equal("status" in outcome && outcome.status, "PAYMENT_PENDING");
  assert.notEqual([...orders.orders.values()][0].status, "PAID");
});

test("no Audit Event carries a credential, a signature, or Conversation text", async () => {
  const { audit } = await approvedCheckout({
    payment: {
      status: "FOUND",
      value: {
        providerPaymentId: "pay_TEST1",
        providerOrderId: "order_TEST1",
        amountMinor: 1599700,
        currency: "INR",
        status: "captured",
        captured: true,
      },
    },
  });

  // The Guest Session is a protected correlation field, not free text, so it
  // is checked separately from the prose a person reads.
  const prose = audit.events
    .map((event) =>
      [
        event.message,
        event.detail ?? "",
        event.providerReference ?? "",
        event.reasonCode,
      ].join(" "),
    )
    .join(" ");
  for (const forbidden of [
    "Basic ",
    "valid-signature",
    "rzp_test_examplekey",
    GUEST_SESSION_ID,
    "OTP",
    "card number",
  ]) {
    assert.equal(
      prose.toLowerCase().includes(forbidden.toLowerCase()),
      false,
      `${forbidden} must never reach an Audit Event`,
    );
  }
  for (const event of audit.events) {
    assert.ok(event.reasonCode.length > 0);
    assert.ok(event.correlationId.length > 0);
    assert.ok(event.actorType);
    assert.equal(event.guestSessionId, GUEST_SESSION_ID);
  }
});

test("no Customer-visible timeline event names an MCP or transport concept", async () => {
  const { audit } = await approvedCheckout();

  for (const event of audit.events.filter((entry) => entry.customerVisible)) {
    assert.doesNotMatch(
      `${event.message} ${event.detail ?? ""}`,
      /MCP|transport|adapter|tool call/i,
    );
  }
});
