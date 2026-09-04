import { Search } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * The accessible name announced while a Conversation Turn is in flight.
 *
 * Catalog search is the only capability the Commerce Agent has, so this is the
 * one thing the Storefront can truthfully say about work it cannot observe. It
 * is announced once and stays until the Turn resolves, however long that takes.
 */
export const PENDING_TURN_STATUS = "Searching the Catalog";

/**
 * The placeholder shown while a Conversation Turn is in flight.
 *
 * It is deliberately minimal. A Turn may answer with no Recommendations at
 * all, so card-shaped placeholders would promise Products the answer never
 * delivers and make an honest reply read as a failure. What is left is the
 * spoken status and two bars in the shape of the words the Turn is certain to
 * produce, in the same message position the answer will occupy, so the answer
 * replaces the placeholder in place. The bars are decorative and hidden from
 * assistive technology; the status beside them carries the meaning.
 */
export function AgentPending() {
  return (
    <div className="flex flex-col gap-5">
      <p
        role="status"
        className="flex items-center gap-2 eyebrow text-xs text-muted-foreground"
      >
        <Search aria-hidden="true" className="size-3.5 shrink-0" />
        {PENDING_TURN_STATUS}
      </p>

      <div aria-hidden="true" className="flex max-w-3xl flex-col gap-3">
        <Skeleton className="h-8 w-[80%] sm:h-9" />
        <Skeleton className="h-8 w-[55%] sm:h-9" />
      </div>
    </div>
  );
}
