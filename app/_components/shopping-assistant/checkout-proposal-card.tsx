import { useEffect, useState } from "react";
import { CircleAlert, History, Lock, ShieldCheck } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import type { CheckoutProposal } from "@/modules/checkout/checkout-proposal";

/** How often the expiry line is recomputed while a proposal is on screen. */
const EXPIRY_TICK_MS = 15_000;

/**
 * Renders one immutable Checkout Proposal for explicit Approval.
 *
 * The card is the only place a payment can be authorized, and it shows
 * everything that authorization covers: each Product with its quantity and
 * Cart Price, the explicit zero Discount, Shipping, and Tax this release
 * charges, the payable total, the Cart version the amounts came from, and how
 * long they stand. The Approval control names the exact amount and its Razorpay
 * Test Checkout consequence, so no wording elsewhere — typed, generated, or
 * modelled — can stand in for it.
 *
 * An outdated or expired proposal is history: it keeps the amounts the
 * Customer saw, says the Cart or the clock moved on, and withdraws its
 * Approval control rather than authorizing a stale amount.
 */
export function CheckoutProposalCard({
  proposal,
  isOutdated = false,
  onApprove,
  isApproving = false,
  error,
}: {
  proposal: CheckoutProposal;
  isOutdated?: boolean;
  onApprove?: () => void;
  isApproving?: boolean;
  error?: string | null;
}) {
  const minutesLeft = useExpiryMinutes(proposal.expiresAt);
  const isExpired = minutesLeft === null;
  const isRetired = isOutdated || isExpired || proposal.status !== "ACTIVE";
  const total = formatMoney(proposal.checkoutTotalMinor, proposal.currency);

  return (
    <section
      aria-label="Checkout proposal"
      className={cn(
        "overflow-hidden rounded-lg border-2 bg-card text-card-foreground",
        isRetired ? "border-accent" : "border-sidebar-border",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4 sm:px-6">
        <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <ShieldCheck aria-hidden="true" className="size-4 text-secondary" />
          Checkout proposal
          {isRetired ? (
            <Badge variant="accent" className="ml-1">
              <History aria-hidden="true" />
              Outdated
            </Badge>
          ) : null}
        </p>
        <p className="eyebrow text-[10px] text-muted-foreground">
          Prepared from Cart version {proposal.cartVersion}
        </p>
      </div>

      {isRetired ? (
        <div className="border-b border-border px-5 py-4 sm:px-6">
          <Alert variant="warning">
            <History aria-hidden="true" />
            <span>
              {isOutdated
                ? "The Cart changed after this proposal. Check out again for a current amount."
                : "This proposal expired before it was approved. Check out again for a current amount."}
            </span>
          </Alert>
        </div>
      ) : null}

      <ol className="divide-y divide-border">
        {proposal.lines.map((line) => (
          <li
            key={line.productId}
            className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-start sm:px-6"
          >
            <div className="min-w-0">
              <p className="font-medium">{line.productName}</p>
              <p className="mt-1 font-mono text-sm text-muted-foreground">
                {line.quantity} ×{" "}
                {formatMoney(line.cartPriceMinor, proposal.currency)}
              </p>
            </div>
            <p
              aria-label={`${line.productName} line total`}
              className="font-mono text-sm font-bold tabular-nums sm:text-right"
            >
              {formatMoney(line.lineTotalMinor, proposal.currency)}
            </p>
          </li>
        ))}
      </ol>

      <dl className="space-y-2 border-t border-border px-5 py-4 text-sm sm:px-6">
        <AmountRow
          label="Items subtotal"
          amountMinor={proposal.itemsSubtotalMinor}
          currency={proposal.currency}
        />
        <AmountRow
          label="Discount"
          amountMinor={proposal.discountMinor}
          currency={proposal.currency}
        />
        <AmountRow
          label="Shipping"
          amountMinor={proposal.shippingMinor}
          currency={proposal.currency}
        />
        <AmountRow
          label="Tax"
          amountMinor={proposal.taxMinor}
          currency={proposal.currency}
        />
      </dl>

      <div className="flex items-center justify-between border-t-2 border-sidebar-border bg-muted px-5 py-4 sm:px-6">
        <dt className="text-sm font-semibold tracking-tight">Total to pay</dt>
        <dd
          aria-label="Total to pay"
          className="font-mono text-lg font-bold tabular-nums"
        >
          {total}
        </dd>
      </div>

      <div className="space-y-4 px-5 py-5 sm:px-6">
        <p className="flex items-start gap-2.5 text-sm text-muted-foreground">
          <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {proposal.policy.explanation}
        </p>
        <p
          aria-label="Proposal expiry"
          className="eyebrow text-[10px] text-muted-foreground"
        >
          {minutesLeft === null
            ? "Expired"
            : `Expires in ${minutesLeft} ${minutesLeft === 1 ? "minute" : "minutes"}`}
        </p>
        {isRetired ? null : (
          <Button
            type="button"
            className="w-full"
            disabled={isApproving || !onApprove}
            onClick={onApprove}
          >
            {`Approve and pay ${total} with Razorpay Test Checkout`}
          </Button>
        )}
        <p className="text-center text-xs font-semibold text-secondary">
          Test Mode — no real charge is made.
        </p>
        {error ? (
          <Alert role="alert">
            <CircleAlert aria-hidden="true" />
            <span>{error}</span>
          </Alert>
        ) : null}
      </div>

      <p className="border-t border-border bg-muted px-5 py-3 text-xs text-muted-foreground sm:px-6">
        This checkout reserves no inventory and does not arrange fulfilment.
      </p>
    </section>
  );
}

function AmountRow({
  label,
  amountMinor,
  currency,
}: {
  label: string;
  amountMinor: number;
  currency: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd aria-label={label} className="font-mono tabular-nums">
        {formatMoney(amountMinor, currency)}
      </dd>
    </div>
  );
}

/**
 * Whole minutes a Customer still has to approve this proposal.
 *
 * Expiry is measured against the proposal's stored instant rather than a
 * countdown the browser started, so a tab left open cannot appear to extend
 * the ten minutes. `null` means the proposal can no longer be approved.
 */
function useExpiryMinutes(expiresAt: string): number | null {
  const remaining = () => {
    const milliseconds = new Date(expiresAt).getTime() - Date.now();
    return milliseconds > 0 ? Math.ceil(milliseconds / 60_000) : null;
  };
  const [minutes, setMinutes] = useState(remaining);

  useEffect(() => {
    const timer = setInterval(() => setMinutes(remaining()), EXPIRY_TICK_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  return minutes;
}
