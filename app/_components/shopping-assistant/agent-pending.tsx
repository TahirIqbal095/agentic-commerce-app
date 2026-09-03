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
 * Placeholders in the shape of the Commerce Agent's answer.
 *
 * They occupy the same message shell the resolved Turn will occupy — headline,
 * Context Summary constraints, Recommendation cards — so the Recommendation Set
 * replaces them in place rather than arriving somewhere new. Every placeholder
 * is decorative and hidden from assistive technology; the status beside them
 * carries the meaning.
 */
export function AgentPending() {
  return (
    <div className="flex flex-col gap-8">
      <p
        role="status"
        className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground"
      >
        <Search aria-hidden="true" className="size-3.5 shrink-0" />
        {PENDING_TURN_STATUS}
      </p>

      <div className="flex flex-col gap-5">
        <div aria-hidden="true" className="flex max-w-3xl flex-col gap-3">
          <Skeleton className="h-8 w-[80%] sm:h-9" />
          <Skeleton className="h-8 w-[55%] sm:h-9" />
        </div>
        <div aria-hidden="true" className="flex max-w-2xl flex-wrap gap-2">
          <Skeleton className="h-7 w-28 rounded-full" />
          <Skeleton className="h-7 w-36 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-full" />
        </div>
      </div>

      <div
        aria-hidden="true"
        className="flex gap-4 overflow-hidden"
        data-slot="recommendation-placeholders"
      >
        {[0, 1, 2].map((slot) => (
          <div
            key={slot}
            className="w-[min(82vw,20rem)] shrink-0 sm:w-[min(20rem,calc((100%-1rem)/2.2))] lg:w-[min(20rem,calc((100%-2rem)/2.7))]"
          >
            <div className="overflow-hidden rounded-lg border-2 border-sidebar-border bg-card">
              <Skeleton className="h-28 rounded-none border-b border-border" />
              <div className="flex flex-col gap-3 p-5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-[70%]" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-[60%]" />
                <div className="flex items-center gap-3 pt-2">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="ml-auto h-8 w-24 rounded-md" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
