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
 *
 * The account reads the same wherever it is shown — inside the checkout status
 * card on a narrow viewport, in the rail beside the Conversation on a wide
 * one — so it carries no edge of its own and takes the one its host gives it.
 *
 * The account ends by saying how long the Customer keeps it. This release has
 * no Customer accounts and no contact-based recovery, so the Guest Session
 * cookie in this browser is the only thing that can reach this checkout —
 * telling the Customer that plainly is part of being honest about a test-only
 * demonstration, not a footnote about it. The Brand's own evidence outlives
 * the session either way (ADR-0011).
 */
export function CheckoutTimeline({
  entries,
}: {
  entries: CheckoutTimelineEntry[];
}) {
  if (entries.length === 0) return null;

  return (
    <section aria-label="Checkout timeline" className="px-5 py-5 sm:px-6">
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
      <p className="mt-4 text-xs text-muted-foreground">
        This timeline is kept for this browser only. Clearing your browser data
        or letting this session expire ends your access to it, and it cannot be
        recovered.
      </p>
    </section>
  );
}
