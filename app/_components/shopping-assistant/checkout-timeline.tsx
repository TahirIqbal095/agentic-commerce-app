import { Clock } from "lucide-react";

import type { CheckoutTimelineEntry } from "@/modules/checkout/checkout-status";

/**
 * Renders the privacy-safe account of what happened during one checkout.
 *
 * A Customer reads this to understand their purchase, so each step leads with
 * plain language and keeps its technical line collapsed behind a disclosure
 * rather than crowding the explanation. What is shown is exactly what the
 * projection allowed: no secret, signature, payment instrument, OTP, raw
 * provider payload, or implementation name can appear here, because none of
 * them reached the Audit Event it was projected from.
 */
export function CheckoutTimeline({
  entries,
}: {
  entries: CheckoutTimelineEntry[];
}) {
  if (entries.length === 0) return null;

  return (
    <section
      aria-label="Checkout timeline"
      className="border-t border-border px-5 py-5 sm:px-6"
    >
      <p className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-tight">
        <Clock aria-hidden="true" className="size-4 text-muted-foreground" />
        Checkout timeline
      </p>
      <ol className="space-y-4">
        {entries.map((entry) => (
          <li key={entry.id} className="border-l-2 border-border pl-4">
            <h4 className="text-sm font-semibold tracking-tight">
              {entry.title}
            </h4>
            <p className="mt-1 text-sm text-muted-foreground">
              {entry.explanation}
            </p>
            <time
              dateTime={entry.occurredAt}
              className="eyebrow mt-1 block text-[10px] text-muted-foreground"
            >
              {new Date(entry.occurredAt).toISOString()}
            </time>
            {entry.detail ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Technical details
                </summary>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {entry.detail}
                </p>
              </details>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
