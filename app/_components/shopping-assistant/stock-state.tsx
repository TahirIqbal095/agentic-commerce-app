import { CircleCheck, CircleSlash } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A Product's availability, stated three ways.
 *
 * The theme's positive token is teal rather than green, so it does not read as
 * "in stock" on its own. The icon and the words carry the meaning; the colour
 * only reinforces it, which is also what keeps this legible to a Customer who
 * does not distinguish colours reliably.
 */
export function StockState({ inStock }: { inStock: boolean }) {
  const Icon = inStock ? CircleCheck : CircleSlash;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 eyebrow text-[10px]",
        inStock ? "text-secondary" : "text-accent",
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {inStock ? "In stock" : "Unavailable"}
    </span>
  );
}
