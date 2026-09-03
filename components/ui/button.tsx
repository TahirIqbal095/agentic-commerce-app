import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * The Brand's button language, carried centrally.
 *
 * Raised variants take a structural border and a hard offset shadow keyed to
 * the same token, so they invert correctly between appearances, and they
 * translate into their own shadow on hover and press. Flat variants — ghost and
 * link-like controls — take neither, because a border and a shadow on every
 * small control turns a row of them into noise.
 *
 * Focus is left to the offset outline declared in the base layer rather than an
 * inner ring, which on this border-heavy design would land on top of the
 * element's own border.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium tracking-tight transition-all duration-75 motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-2 border-sidebar-border bg-primary text-primary-foreground shadow-hard hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-hard-sm active:translate-x-1 active:translate-y-1 active:shadow-hard-none",
        secondary:
          "border-2 border-sidebar-border bg-secondary text-secondary-foreground shadow-hard hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-hard-sm active:translate-x-1 active:translate-y-1 active:shadow-hard-none",
        outline:
          "border-2 border-sidebar-border bg-card text-card-foreground shadow-hard-sm hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-hard-none active:translate-x-0.5 active:translate-y-0.5",
        ghost: "text-foreground hover:bg-muted",
        destructive: "text-destructive hover:bg-destructive/10",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        icon: "size-10",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
