import { CircleAlert, CircleCheck, History } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CheckoutReadiness } from "@/modules/cart/checkout-readiness";
import { CartPanel, type CartControls } from "./cart-panel";

/**
 * Renders one deterministic Checkout Readiness result.
 *
 * Every value shown is the authoritative one the review evaluated, and the card
 * names the Cart version it read, so a Customer can tell which Cart was
 * judged. A blocked review is actionable: the Cart Summary carries the same
 * explicit quantity and removal controls as the Cart drawer, and nothing on the
 * card changes the Cart on its own.
 *
 * An outdated card is history. It keeps the result the Customer saw, states
 * that the Cart has moved on, and withdraws its controls so a stale review can
 * never be acted on as if it were current. Its historical standing is carried
 * by a badge and by the warning's words as well as by the accent colour.
 */
export function CheckoutReadinessCard({
  readiness,
  isOutdated = false,
  controls,
}: {
  readiness: CheckoutReadiness;
  isOutdated?: boolean;
  controls?: CartControls;
}) {
  const isReady = readiness.status === "READY";
  const correctionControls =
    !isOutdated && !isReady && controls ? controls : undefined;

  return (
    <section
      aria-label="Checkout readiness"
      className={cn(
        "overflow-hidden rounded-lg border-2 bg-card text-card-foreground",
        isOutdated ? "border-accent" : "border-sidebar-border",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4 sm:px-6">
        <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          {isReady ? (
            <CircleCheck aria-hidden="true" className="size-4 text-secondary" />
          ) : (
            <CircleAlert
              aria-hidden="true"
              className="size-4 text-destructive"
            />
          )}
          {isReady ? "Ready for checkout" : "Not ready for checkout"}
          {isOutdated ? (
            <Badge variant="accent" className="ml-1">
              <History aria-hidden="true" />
              Outdated
            </Badge>
          ) : null}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Evaluated at Cart version {readiness.cart.version}
        </p>
      </div>

      {isOutdated ? (
        <div className="border-b border-border px-5 py-4 sm:px-6">
          <Alert variant="warning">
            <History aria-hidden="true" />
            <span>
              The Cart changed after this review. Review the Cart again for a
              current result.
            </span>
          </Alert>
        </div>
      ) : null}

      {readiness.blockers.length > 0 ? (
        <ul className="divide-y divide-border">
          {readiness.blockers.map((blocker) => (
            <li
              key={
                "productId" in blocker
                  ? `${blocker.code}:${blocker.productId}`
                  : blocker.code
              }
              className="flex items-start gap-2.5 px-5 py-4 text-sm text-destructive sm:px-6"
            >
              <CircleAlert
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              {blocker.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="px-5 py-5 sm:px-6">
        <CartPanel cart={readiness.cart} controls={correctionControls} />
      </div>

      <p className="border-t border-border bg-muted px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground sm:px-6">
        This review reserves no inventory and starts no payment.
      </p>
    </section>
  );
}
