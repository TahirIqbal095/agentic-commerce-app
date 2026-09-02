import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import type { CatalogProduct } from "@/modules/catalog/catalog";
import type { CartFeedback } from "./types";

type ProductApiResponse =
  { data: CatalogProduct } | { error: { message: string } };

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
    <div className="fixed inset-0 z-50 grid place-items-end bg-[#1d2a24]/35 p-3 backdrop-blur-sm sm:place-items-center sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`${product.name} details`}
        aria-busy={isLoading}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[1.75rem] border border-white/60 bg-[#f8f6f1] p-6 shadow-2xl shadow-[#1d2a24]/25 sm:p-8"
      >
        <div className="flex items-start justify-between gap-5">
          <div>
            {details ? (
              <Badge
                variant="outline"
                className="border-[#1d2a24]/10 bg-white/55 font-normal text-[#526158]"
              >
                {details.category}
              </Badge>
            ) : null}
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em]">
              {product.name}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {details ? (
              <span
                className={cn(
                  "flex shrink-0 items-center gap-1.5 text-sm",
                  details.inStock ? "text-emerald-700" : "text-amber-700",
                )}
              >
                <span className="size-1.5 rounded-full bg-current" />
                {details.inStock ? "In stock" : "Unavailable"}
              </span>
            ) : null}
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="Close details"
              onClick={onClose}
              className="rounded-full border-[#1d2a24]/10 bg-white/55 shadow-none"
            >
              <X />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <p className="mt-8 text-sm text-[#59665f]">
            Loading product details…
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="mt-8 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </p>
        ) : null}
        {details ? (
          <>
            <p className="mt-6 text-base leading-7 text-[#59665f]">
              {details.description}
            </p>
            <p className="mt-6 text-2xl font-semibold">
              {formatMoney(details.priceMinor, details.currency)}
            </p>
            <Button
              type="button"
              aria-label={`Add ${product.name} to Cart`}
              disabled={isAdding}
              onClick={onAdd}
              className="mt-6 rounded-full bg-[#1d2a24] text-white hover:bg-[#31463a]"
            >
              {isAdding ? "Adding…" : "Add to Cart"}
            </Button>
            {cartFeedback ? (
              <p
                role={cartFeedback.kind === "error" ? "alert" : "status"}
                className={cn(
                  "mt-4 text-sm",
                  cartFeedback.kind === "error"
                    ? "text-red-700"
                    : "text-emerald-700",
                )}
              >
                {cartFeedback.message}
              </p>
            ) : null}
          </>
        ) : null}
        {attributes.length > 0 ? (
          <dl className="mt-8 grid gap-3 border-t border-[#1d2a24]/10 pt-6 sm:grid-cols-2">
            {attributes.map(([name, value]) => (
              <div
                key={name}
                className="rounded-2xl border border-[#1d2a24]/8 bg-white/55 px-4 py-3"
              >
                <dt className="text-xs font-medium text-[#7b857e]">
                  {formatAttributeName(name)}
                </dt>
                <dd className="mt-1 text-sm font-medium">
                  {formatAttributeValue(value)}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </section>
    </div>
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
