/**
 * What the checkout authority is allowed to ask a payment provider for.
 *
 * The authority talks to this interface, never to a transport, so the
 * deterministic rules around a Provider Write can be tested without a network
 * and the production path can be swapped only at the composition root. It is
 * the sole outbound Razorpay path: ADR-0009 forbids a REST or SDK fallback, so
 * an outage surfaces as an outcome here rather than as an unrecorded call
 * somewhere else.
 */

import type {
  ProviderOrderResult,
  ProviderPaymentResult,
} from "./razorpay-tools";

export type CreateProviderOrderInput = {
  amountMinor: number;
  currency: string;
  /** The Provider Operation's own UUID, used as Razorpay's unique receipt. */
  receipt: string;
  /** Opaque, non-personal identifiers that bind this Provider Order to ours. */
  notes: Record<string, string>;
};

/**
 * The result of one dispatched Provider Write.
 *
 * `OUTCOME_UNKNOWN` is a first-class outcome, not an error: the request was
 * dispatched and its answer was lost, so Razorpay may have applied it. Treating
 * that as a failure is exactly the mistake that creates duplicate Provider
 * Orders and asks a Customer to pay twice.
 */
export type ProviderWriteOutcome =
  | { status: "SUCCEEDED"; providerOrder: ProviderOrderResult }
  | { status: "OUTCOME_UNKNOWN"; reasonCode: string; message: string }
  | { status: "FAILED"; reasonCode: string; message: string };

export type ProviderReadOutcome<Value> =
  | { status: "FOUND"; value: Value }
  | { status: "ABSENT" }
  | { status: "UNAVAILABLE"; reasonCode: string; message: string };

export interface RazorpayProviderGateway {
  createOrder(input: CreateProviderOrderInput): Promise<ProviderWriteOutcome>;
  /** Looks one Provider Order up by the receipt that identifies our operation. */
  findOrderByReceipt(
    receipt: string,
  ): Promise<ProviderReadOutcome<ProviderOrderResult>>;
  fetchOrder(
    providerOrderId: string,
  ): Promise<ProviderReadOutcome<ProviderOrderResult>>;
  fetchPayment(
    providerPaymentId: string,
  ): Promise<ProviderReadOutcome<ProviderPaymentResult>>;
}
