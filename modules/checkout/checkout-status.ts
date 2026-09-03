/**
 * The Customer-visible state of one Conversational Checkout, free of any
 * database, provider, or credential access.
 *
 * The Storefront renders it and the checkout routes return it, so both describe
 * the same Order, the same Provider Order, the same remaining launches, and the
 * same Checkout Timeline. Nothing here carries a secret, a signature, a payment
 * instrument, or a raw provider payload.
 */

/** How far one internal Order has progressed toward a captured payment. */
export type OrderStatus =
  | "PAYMENT_SETUP"
  | "PAYMENT_PENDING"
  | "PAID"
  | "PAYMENT_FAILED";

/**
 * The durable, retry-safe execution of one Provider Write.
 *
 * `OUTCOME_UNKNOWN` is deliberately not a failure: the request was dispatched
 * and its result was lost, so Razorpay may or may not have applied it.
 */
export type ProviderOperationStatus =
  | "READY"
  | "DISPATCHED"
  | "SUCCEEDED"
  | "OUTCOME_UNKNOWN"
  | "CONFIRMED_ABSENT"
  | "FAILED";

export type PaymentAttemptStatus =
  | "OPENED"
  | "DISMISSED"
  | "FAILED"
  | "CAPTURED";

/**
 * One entry in the privacy-safe projection of Audit Events a Customer reads.
 *
 * The title and explanation are the Customer's account of what happened; the
 * detail is the collapsed technical line, which carries only safe identifiers
 * and never a secret, a signature, or an MCP implementation name.
 */
export type CheckoutTimelineEntry = {
  id: string;
  occurredAt: string;
  title: string;
  explanation: string;
  detail: string | null;
};

/**
 * The verified Provider Order managed Checkout may be opened against.
 *
 * The key ID is Razorpay's publishable Test key; the Test API secret and the
 * webhook signing secret never leave the server.
 */
export type ProviderOrderView = {
  providerOrderId: string;
  amountMinor: number;
  currency: string;
  keyId: string;
};

export type CheckoutStatusView = {
  orderId: string;
  status: OrderStatus;
  currency: string;
  totalMinor: number;
  providerOperation: {
    status: ProviderOperationStatus;
    reconciliationReadsUsed: number;
    /**
     * Whether a Customer may ask for one more safe observation of Razorpay
     * state. It is a read, never a second attempt at creating a Provider Order.
     */
    canCheckStatus: boolean;
  };
  providerOrder: ProviderOrderView | null;
  launchesUsed: number;
  launchesRemaining: number;
  /**
   * Present when checkout stopped and the reason must be shown, such as an
   * Unknown Provider Outcome that reconciliation could not resolve or a
   * reconciled Provider Order whose details did not match the Approval.
   */
  blockedReason?: string;
  timeline: CheckoutTimelineEntry[];
};
