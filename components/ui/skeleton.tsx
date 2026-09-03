import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A decorative placeholder in the shape of content that has not arrived.
 *
 * It is hidden from assistive technology by default: a screen reader is told
 * what is happening by the accompanying status, not by a list of empty boxes.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-md bg-muted motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
