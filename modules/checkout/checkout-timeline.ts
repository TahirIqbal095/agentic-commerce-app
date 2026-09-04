/**
 * The Customer-visible projection of one checkout's Audit Events.
 *
 * A Customer is owed an account of what the Storefront did on their behalf,
 * not a debug log. So the timeline is a narrowing, not a dump: it renames each
 * recorded event into a plain-language title, keeps the Customer-safe
 * explanation, and carries at most one collapsed technical line built from
 * identifiers that are already safe to show. Events not marked Customer-visible
 * never appear, and nothing here can widen what the audit record chose to keep.
 */

import type { CheckoutEventType } from "./checkout-audit";
import type { CheckoutTimelineEntry } from "./checkout-status";

/**
 * The Customer's name for each recorded moment.
 *
 * The words describe outcomes — what was asked for, what came back, what the
 * Storefront did next — and deliberately avoid MCP, transport, and adapter
 * vocabulary, which would tell a Customer about our implementation rather than
 * about their purchase.
 */
const TIMELINE_TITLES: Partial<Record<CheckoutEventType, string>> = {
  CHECKOUT_PROPOSAL_PREPARED: "Checkout prepared",
  CHECKOUT_POLICY_EVALUATED: "Your approval required",
  CHECKOUT_APPROVAL_RECORDED: "You approved the amount",
  ORDER_CREATED: "Order created",
  PROVIDER_ORDER_REQUESTED: "Razorpay Test Mode asked to create the payment",
  PROVIDER_ORDER_CREATED: "Razorpay Test Mode created the payment",
  PROVIDER_OUTCOME_UNKNOWN: "Razorpay's answer did not arrive",
  PROVIDER_RECONCILIATION_ATTEMPTED: "Checked what Razorpay actually did",
  PROVIDER_ORDER_RECONCILED: "Found the exact payment already created",
  PROVIDER_ORDER_MISMATCHED: "Razorpay returned different details",
  PROVIDER_ORDER_CONFIRMED_ABSENT: "Razorpay had created nothing",
  PROVIDER_OPERATION_FAILED: "Payment could not be prepared",
  CHECKOUT_LAUNCH_OPENED: "Razorpay Test Checkout opened",
  CHECKOUT_LAUNCH_DISMISSED: "You closed Razorpay Test Checkout",
  CHECKOUT_LAUNCH_FAILED: "Razorpay Test Checkout did not complete",
  PAYMENT_CALLBACK_VERIFIED: "Payment result verified",
  PAYMENT_CALLBACK_REFUSED: "Payment result refused",
  PAYMENT_CAPTURED: "Razorpay captured the test payment",
  ORDER_PAID: "Order paid",
  CART_CONVERTED: "Your Cart became order history",
  ORDER_PAYMENT_FAILED: "Order could not be paid",
  PROVIDER_NOTIFICATION_RECEIVED: "Razorpay sent an update",
};

/** One recorded event, as the projection reads it from durable storage. */
export type CheckoutAuditRecord = {
  id: string;
  eventType: string;
  message: string;
  detail: string | null;
  customerVisible: boolean;
  occurredAt: Date;
};

/**
 * Projects recorded events into the Checkout Timeline a Customer reads.
 *
 * Only Customer-visible events with a Customer-facing title survive, so an
 * operational event added later cannot leak into the Conversation merely by
 * being recorded. Order is the order things happened in.
 *
 * @param records - Audit Events for one checkout, oldest first.
 * @returns The privacy-safe timeline entries to render.
 */
export function projectCheckoutTimeline(
  records: CheckoutAuditRecord[],
): CheckoutTimelineEntry[] {
  return records.flatMap((record) => {
    const title = TIMELINE_TITLES[record.eventType as CheckoutEventType];
    if (!record.customerVisible || !title) return [];
    return [
      {
        id: record.id,
        occurredAt: record.occurredAt.toISOString(),
        title,
        explanation: record.message,
        detail: record.detail,
      },
    ];
  });
}
