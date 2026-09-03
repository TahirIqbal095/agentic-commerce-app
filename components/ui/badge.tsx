import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * A small status or metadata chip.
 *
 * Chips carry a single-weight divider border and never a shadow: a constraint
 * row is a dozen of these side by side, and raising each one would turn the
 * Context Summary into noise.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-sidebar-border bg-primary text-primary-foreground",
        secondary:
          "border-sidebar-border bg-secondary text-secondary-foreground",
        accent: "border-sidebar-border bg-accent text-accent-foreground",
        outline: "border-border bg-card text-card-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
