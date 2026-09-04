import {
  CircleAlert,
  CircleCheck,
  CreditCard,
  Loader,
  RefreshCw,
} from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format-money";
import { CHECKOUT_MAX_PAYMENT_ATTEMPTS } from "@/modules/checkout/checkout-bounds";
import type {
  CheckoutStatusView,
  OrderStatus,
} from "@/modules/checkout/checkout-status";
import { CheckoutTimeline } from "./checkout-timeline";

/**
 * What each Order state means to the Customer looking at it.
 *
 * A dismissed or declined attempt leaves the Order waiting, never "failed":
 * only exhausting every permitted launch is a terminal outcome, and the words
 * here are careful to say so.
 */
const STATUS_HEADINGS: Record<OrderStatus, string> = {
  PAYMENT_SETUP: "Preparing your payment",
  PAYMENT_PENDING: "Waiting for payment",
  PAID: "Paid in Razorpay Test Mode",
  PAYMENT_FAILED: "Payment not completed",
};

/**
 * What a Customer is told while a dispatched payment request has no answer.
 *
 * It names the uncertainty honestly and, just as importantly, says what did
 * not happen: no second payment was requested. That reassurance is the whole
 * point of reconciling before retrying, so the Customer is told it plainly
 * rather than left to infer it from an absence.
 */
const OUTCOME_UNKNOWN_REASSURANCE =
  "Razorpay\u2019s answer did not arrive, so the Storefront is checking what it actually did. No second payment has been requested.";

/**
 * Renders one checkout after Approval: what state it is in, what the Customer
 * may still do, and — unless the rail beside the Conversation is showing it —
 * the Checkout Timeline that explains how it got here.
 */
export function CheckoutStatusCard({
  checkout,
  isBusy = false,
  error,
  showTimeline = true,
  onRetry,
  onCheckStatus,
  onReturnToShopping,
}: {
  checkout: CheckoutStatusView;
  isBusy?: boolean;
  error?: string | null;
  /**
   * Whether this card is the Timeline's home. It is false only when the rail
   * has it, so a Customer is never reading two copies of one account.
   */
  showTimeline?: boolean;
  onRetry?: () => void;
  onCheckStatus?: () => void;
  onReturnToShopping?: () => void;
}) {
  const isPaid = checkout.status === "PAID";
  const isOutcomeUnknown =
    checkout.providerOperation.status === "OUTCOME_UNKNOWN";
  const isTerminal = isPaid || checkout.status === "PAYMENT_FAILED";
  const canRetry =
    !isTerminal && checkout.launchesRemaining > 0 && checkout.providerOrder;

  return (
    <section
      aria-label="Checkout status"
      className="overflow-hidden rounded-lg border-2 border-sidebar-border bg-card text-card-foreground"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4 sm:px-6">
        <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          {isPaid ? (
            <CircleCheck aria-hidden="true" className="size-4 text-secondary" />
          ) : checkout.status === "PAYMENT_FAILED" ? (
            <CircleAlert aria-hidden="true" className="size-4 text-destructive" />
          ) : (
            <Loader aria-hidden="true" className="size-4 text-muted-foreground" />
          )}
          {STATUS_HEADINGS[checkout.status]}
        </p>
        <p
          aria-label={isPaid ? "Amount paid" : "Total to pay"}
          className="font-mono text-lg font-bold tabular-nums"
        >
          {formatMoney(checkout.totalMinor, checkout.currency)}
        </p>
      </div>

      <div className="space-y-4 px-5 py-5 sm:px-6">
        {isOutcomeUnknown ? (
          <Alert variant="warning">
            <CircleAlert aria-hidden="true" />
            <span>{OUTCOME_UNKNOWN_REASSURANCE}</span>
          </Alert>
        ) : null}
        {checkout.blockedReason ? (
          <Alert role="alert">
            <CircleAlert aria-hidden="true" />
            <span>{checkout.blockedReason}</span>
          </Alert>
        ) : null}
        {error ? (
          <Alert role="alert">
            <CircleAlert aria-hidden="true" />
            <span>{error}</span>
          </Alert>
        ) : null}

        {canRetry ? (
          <>
            <Button
              type="button"
              className="w-full"
              disabled={isBusy}
              onClick={onRetry}
            >
              <CreditCard />
              Try Razorpay Test Checkout again
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              {checkout.launchesRemaining} of {CHECKOUT_MAX_PAYMENT_ATTEMPTS}{" "}
              attempts remaining
            </p>
          </>
        ) : null}

        {checkout.providerOperation.canCheckStatus ? (
          <>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={isBusy}
              onClick={onCheckStatus}
            >
              <RefreshCw />
              Check Razorpay status
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              This only looks at what Razorpay already has. It never asks for a
              second payment.
            </p>
          </>
        ) : null}

        {checkout.status === "PAYMENT_FAILED" ? (
          <>
            <p className="text-sm text-muted-foreground">
              This Order cannot be paid. Nothing was charged and no inventory
              was held, so you can start again with a fresh Cart whenever you
              like.
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={onReturnToShopping}
            >
              Return to shopping
            </Button>
          </>
        ) : null}

        <p className="text-center text-xs font-semibold text-secondary">
          Test Mode — no real charge is made.
        </p>
      </div>

      {showTimeline && checkout.timeline.length > 0 ? (
        <div className="border-t border-border">
          <CheckoutTimeline entries={checkout.timeline} />
        </div>
      ) : null}

      <p className="border-t border-border bg-muted px-5 py-3 text-xs text-muted-foreground sm:px-6">
        This checkout reserves no inventory and does not arrange fulfilment.
      </p>
    </section>
  );
}
