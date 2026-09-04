import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A raised surface.
 *
 * Cards are structural, so they take the double-weight sidebar border and the
 * hard offset shadow. Both are keyed to the sidebar border token, so a card's
 * edge and its shadow stay the same ink and the outline reads as one shape.
 */
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col rounded-lg border-2 border-sidebar-border bg-card text-card-foreground shadow-hard",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("grid gap-2 px-5 pt-5", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-5 pb-5", className)}
      {...props}
    />
  );
}

export { Card, CardContent, CardHeader };
