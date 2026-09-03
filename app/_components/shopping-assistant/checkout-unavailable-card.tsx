import { CircleAlert } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import type { CheckoutBoundViolation } from "@/modules/checkout/checkout-bounds";

/**
 * Explains why this Storefront cannot prepare a checkout right now.
 *
 * A Cart outside the demonstration's bounds, and a Brand whose Razorpay Test
 * Mode credentials are absent or malformed, both reach the Customer as an
 * explanation rather than as a broken Approval control. The rest of the
 * Storefront stays usable, so a Customer can keep shopping.
 */
export function CheckoutUnavailableCard({
  explanation,
  violations,
}: {
  explanation: string;
  violations: CheckoutBoundViolation[];
}) {
  return (
    <section
      aria-label="Checkout unavailable"
      className="overflow-hidden rounded-lg border-2 border-sidebar-border bg-card text-card-foreground"
    >
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <CircleAlert aria-hidden="true" className="size-4 text-destructive" />
          Checkout unavailable
        </p>
      </div>
      <div className="space-y-3 px-5 py-5 sm:px-6">
        <p className="text-sm">{explanation}</p>
        {violations.length > 0 ? (
          <ul className="space-y-2">
            {violations.map((violation) => (
              <li key={violation.code}>
                <Alert>
                  <CircleAlert aria-hidden="true" />
                  <span>{violation.message}</span>
                </Alert>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
