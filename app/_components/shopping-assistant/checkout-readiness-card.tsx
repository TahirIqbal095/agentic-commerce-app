import { CircleAlert, CircleCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
 * never be acted on as if it were current.
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
      className="overflow-hidden rounded-3xl border border-[#1d2a24]/10 bg-white/70 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1d2a24]/10 px-5 py-4 sm:px-6">
        <p className="flex items-center gap-2 text-sm font-semibold">
          {isReady ? (
            <CircleCheck className="size-4 text-[#57a773]" />
          ) : (
            <CircleAlert className="size-4 text-red-700" />
          )}
          {isReady ? "Ready for checkout" : "Not ready for checkout"}
          {isOutdated ? (
            <Badge variant="secondary" className="ml-1 font-medium">
              Outdated
            </Badge>
          ) : null}
        </p>
        <p className="text-xs text-[#708176]">
          Evaluated at Cart version {readiness.cart.version}
        </p>
      </div>

      {isOutdated ? (
        <p className="border-b border-[#1d2a24]/10 px-5 py-4 text-sm text-[#708176] sm:px-6">
          The Cart changed after this review. Review the Cart again for a
          current result.
        </p>
      ) : null}

      {readiness.blockers.length > 0 ? (
        <ul className="divide-y divide-[#1d2a24]/10">
          {readiness.blockers.map((blocker) => (
            <li
              key={
                "productId" in blocker
                  ? `${blocker.code}:${blocker.productId}`
                  : blocker.code
              }
              className="px-5 py-4 text-sm text-red-700 sm:px-6"
            >
              {blocker.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="px-5 py-5 sm:px-6">
        <CartPanel cart={readiness.cart} controls={correctionControls} />
      </div>

      <p className="bg-[#eef1eb] px-5 py-3 text-xs text-[#708176] sm:px-6">
        This review reserves no inventory and starts no payment.
      </p>
    </section>
  );
}
