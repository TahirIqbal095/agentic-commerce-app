import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "grid w-full grid-cols-[auto_1fr] items-start gap-3 rounded-md border-2 px-4 py-3 text-sm [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:translate-y-0.5",
  {
    variants: {
      variant: {
        destructive:
          "border-destructive bg-destructive/10 text-destructive [&_svg]:text-destructive",
        warning: "border-accent bg-accent/15 text-foreground",
      },
    },
    defaultVariants: { variant: "destructive" },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Alert, alertVariants };
