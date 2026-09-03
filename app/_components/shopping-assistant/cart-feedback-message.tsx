import { cn } from "@/lib/utils";
import type { CartFeedback } from "./types";

/**
 * The result of one Cart Mutation, reported at the surface that performed it.
 *
 * Every surface offering an Add reports its outcome this way, so adding from a
 * Recommendation card and adding from Product details announce the same event
 * the same way. A refusal is assertive because the Customer needs to learn about
 * it without hunting; a success is polite.
 */
export function CartFeedbackMessage({
  feedback,
  className,
}: {
  feedback: CartFeedback;
  className?: string;
}) {
  const isError = feedback.kind === "error";
  return (
    <p
      role={isError ? "alert" : "status"}
      className={cn(
        "text-sm",
        isError ? "text-destructive" : "text-secondary",
        className,
      )}
    >
      {feedback.message}
    </p>
  );
}
