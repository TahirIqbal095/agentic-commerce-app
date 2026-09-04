import assert from "node:assert/strict";
import test from "node:test";
import {
  approveFromCart,
  openStorefront,
  paymentAttemptTicket,
  preparedEntry,
  readyCart,
  statusView,
  storefrontWindow,
} from "./_test/checkout";
import type { CartView } from "@/modules/cart/cart-view";
import type { CheckoutStatusView } from "@/modules/checkout/checkout-status";

/**
 * Proves where a Customer ends up when a checkout settles.
 *
 * A Cart that empties itself is the most startling thing a payment does, so
 * the Storefront says what happened rather than leaving the Customer to infer
 * it. Just as importantly, it says nothing at all while the outcome is
 * unknown, and says it once rather than every time the same outcome is read
 * again.
 */

const capturedPayment = {
  outcome: "COMPLETED" as const,
  paymentId: "pay_TEST0000000001",
  providerOrderId: "order_TEST0000000001",
  signature: "a-server-verified-signature",
};

/** The fresh Cart a Customer is given once the one they paid for is history. */
const freshCart: CartView = {
  id: null,
  version: 0,
  items: [],
  totalQuantity: 0,
  subtotalMinor: 0,
  currency: "INR",
};

const PAID_MESSAGE =
  "Your payment completed in Razorpay Test Mode. This Cart is now part of your order history, and a fresh Cart has started for you.";
const UNPAID_MESSAGE =
  "Nothing was charged in Razorpay Test Mode. Your Cart Items are still here, exactly as you left them.";

async function approveAndPay(
  t: Parameters<typeof openStorefront>[0],
  options: {
    launch: () => Awaited<
      ReturnType<NonNullable<Parameters<typeof openStorefront>[2]>["launch"] & object>
    >;
    afterCallback: CheckoutStatusView;
    cartAfterCheckout?: CartView;
    reconcile?: () => Response;
  },
) {
  let hasSettled = false;
  const opened = await openStorefront(t, storefrontWindow(), {
    launch: options.launch,
    routes: {
      cartRead: () =>
        Response.json({
          data:
            hasSettled && options.cartAfterCheckout
              ? options.cartAfterCheckout
              : readyCart,
        }),
      proposal: () => Response.json({ data: preparedEntry() }),
      approval: () => Response.json({ data: statusView() }),
      paymentAttempt: paymentAttemptTicket,
      callback: () => {
        // A captured payment converts the Cart it paid for, so every Cart read
        // from here on is of the fresh Cart that replaced it.
        hasSettled = true;
        return Response.json({ data: options.afterCallback });
      },
      reconcile: options.reconcile,
    },
  });

  await approveFromCart(opened);
  return opened;
}

test("a captured payment lands the Customer in an empty Cart that says the payment completed", async (t) => {
  const { view, user, within } = await approveAndPay(t, {
    launch: () => capturedPayment,
    afterCallback: statusView({ status: "PAID", launchesUsed: 1 }),
    cartAfterCheckout: freshCart,
  });

  const cart = await view.findByRole("dialog", { name: "Your Cart" });
  assert.ok(within(cart).getByText(PAID_MESSAGE));
  assert.ok(await within(cart).findByText("Your Cart is empty."));
  // The header must agree: it cannot go on reporting Products the Customer no
  // longer has selected. It is behind the open drawer until that is dismissed.
  await user.keyboard("{Escape}");
  assert.ok(await view.findByRole("button", { name: "Cart · 0" }));
});

test("an Order that can no longer be paid lands the Customer in their Cart with its Items intact", async (t) => {
  const { view, within } = await approveAndPay(t, {
    launch: () => ({
      outcome: "FAILED" as const,
      description: "Your test card was declined.",
    }),
    afterCallback: statusView({
      status: "PAYMENT_FAILED",
      launchesUsed: 3,
      launchesRemaining: 0,
    }),
  });

  const cart = await view.findByRole("dialog", { name: "Your Cart" });
  assert.ok(within(cart).getByText(UNPAID_MESSAGE));
  assert.ok(within(cart).getByText("2 × ₹3,499"));
  assert.equal(within(cart).queryByText("Your Cart is empty."), null);
  // The way onward stays where it was, for a Customer who dismisses the
  // message rather than reading it.
  await within(cart).findByRole("button", { name: "Check out" });
  assert.ok(view.getByRole("button", { name: "Return to shopping" }));
});

test("a checkout whose outcome is unknown opens no Cart and claims neither result", async (t) => {
  const { view } = await approveAndPay(t, {
    launch: () => ({ outcome: "DISMISSED" as const }),
    afterCallback: statusView({
      status: "PAYMENT_PENDING",
      launchesUsed: 1,
      launchesRemaining: 2,
      providerOperation: {
        status: "OUTCOME_UNKNOWN",
        reconciliationReadsUsed: 1,
        canCheckStatus: true,
      },
    }),
  });

  await view.findByRole("region", { name: "Checkout status" });
  assert.equal(view.queryByRole("dialog", { name: "Your Cart" }), null);
  assert.equal(view.queryByText(PAID_MESSAGE), null);
  assert.equal(view.queryByText(UNPAID_MESSAGE), null);
});

test("asking Razorpay for the status of a settled checkout restages no Cart", async (t) => {
  const settled = statusView({
    status: "PAID",
    launchesUsed: 1,
    providerOperation: {
      status: "SUCCEEDED",
      reconciliationReadsUsed: 0,
      canCheckStatus: true,
    },
  });
  const { view, user, within } = await approveAndPay(t, {
    launch: () => capturedPayment,
    afterCallback: settled,
    cartAfterCheckout: freshCart,
    reconcile: () => Response.json({ data: settled }),
  });

  const cart = await view.findByRole("dialog", { name: "Your Cart" });
  assert.ok(within(cart).getByText(PAID_MESSAGE));
  await user.keyboard("{Escape}");
  await view.findByRole("button", { name: "Check Razorpay status" });

  await user.click(view.getByRole("button", { name: "Check Razorpay status" }));
  await view.findByText("Paid in Razorpay Test Mode");

  assert.equal(view.queryByRole("dialog", { name: "Your Cart" }), null);
  assert.equal(view.queryByText(PAID_MESSAGE), null);
});

test("a Customer who dismissed the message and reopened the Cart sees the Cart without it", async (t) => {
  const { view, user, within } = await approveAndPay(t, {
    launch: () => capturedPayment,
    afterCallback: statusView({ status: "PAID", launchesUsed: 1 }),
    cartAfterCheckout: freshCart,
  });

  const opened = await view.findByRole("dialog", { name: "Your Cart" });
  assert.ok(within(opened).getByText(PAID_MESSAGE));
  await user.keyboard("{Escape}");
  await view.findByRole("button", { name: "Cart · 0" });

  await user.click(view.getByRole("button", { name: "Cart · 0" }));

  const reopened = await view.findByRole("dialog", { name: "Your Cart" });
  assert.equal(within(reopened).queryByText(PAID_MESSAGE), null);
  assert.ok(within(reopened).getByText("Your Cart is empty."));
});
