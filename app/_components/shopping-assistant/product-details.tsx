import { useEffect, useState } from "react";
import { CircleAlert } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import type { CatalogProduct } from "@/modules/catalog/catalog";
import { StockState } from "./stock-state";
import type { CartFeedback } from "./types";

type ProductApiResponse =
  | { data: CatalogProduct }
  | { error: { message: string } };

/**
 * A Product's full details.
 *
 * The dialog primitive owns focus trapping, escape handling, and locking the
 * page behind it, so closing the details returns the Customer to where they
 * were in the Conversation Transcript rather than to the top of the page.
 */
export function ProductDetails({
  product,
  onClose,
  onAdd,
  isAdding,
  cartFeedback,
}: {
  product: CatalogProduct;
  onClose: () => void;
  onAdd: () => void;
  isAdding: boolean;
  cartFeedback?: CartFeedback;
}) {
  const [details, setDetails] = useState<CatalogProduct | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDetails() {
      try {
        const response = await fetch(`/api/products/${product.id}`);
        const payload = (await response.json()) as ProductApiResponse;

        if (!response.ok || !("data" in payload)) {
          throw new Error(
            "error" in payload
              ? payload.error.message
              : "The product details could not be loaded.",
          );
        }

        if (!cancelled) setDetails(payload.data);
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "The product details could not be loaded.",
          );
        }
      }
    }

    void loadDetails();
    return () => {
      cancelled = true;
    };
  }, [product.id]);

  const attributes = details ? Object.entries(details.attributes) : [];
  const isLoading = details === null && error === null;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        aria-label={`${product.name} details`}
        aria-describedby={undefined}
        aria-busy={isLoading}
        closeLabel="Close details"
      >
        <DialogHeader>
          {details ? (
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="outline" className="font-normal">
                {details.category}
              </Badge>
              <StockState inStock={details.inStock} />
            </div>
          ) : null}
          <DialogTitle>{product.name}</DialogTitle>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading product details…
            </p>
          ) : null}
        </DialogHeader>

        <ScrollArea className="flex-1" viewportClassName="px-6 pb-6">
          {error ? (
            <Alert role="alert">
              <CircleAlert aria-hidden="true" />
              <span>{error}</span>
            </Alert>
          ) : null}
          {details ? (
            <>
              <p className="text-base leading-7 text-muted-foreground">
                {details.description}
              </p>
              <p className="mt-6 font-mono text-2xl font-bold">
                {formatMoney(details.priceMinor, details.currency)}
              </p>
              <Button
                type="button"
                aria-label={`Add ${product.name} to Cart`}
                disabled={isAdding}
                onClick={onAdd}
                className="mt-6"
              >
                {isAdding ? "Adding…" : "Add to Cart"}
              </Button>
              {cartFeedback ? (
                <p
                  role={cartFeedback.kind === "error" ? "alert" : "status"}
                  className={cn(
                    "mt-4 text-sm",
                    cartFeedback.kind === "error"
                      ? "text-destructive"
                      : "text-secondary",
                  )}
                >
                  {cartFeedback.message}
                </p>
              ) : null}
            </>
          ) : null}
          {attributes.length > 0 ? (
            <dl className="mt-8 grid gap-3 border-t border-border pt-6 sm:grid-cols-2">
              {attributes.map(([name, value]) => (
                <div
                  key={name}
                  className="rounded-md border border-border bg-background px-4 py-3"
                >
                  <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {formatAttributeName(name)}
                  </dt>
                  <dd className="mt-1 text-sm font-medium">
                    {formatAttributeValue(value)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function formatAttributeName(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

function formatAttributeValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return String(value);
}
