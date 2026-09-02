import { ArrowRight, Headphones, Package, ShoppingBag } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import type { CatalogProduct } from "@/modules/catalog/catalog";
import type { CartFeedback } from "./types";

export function ProductCard({
  product,
  index,
  onView,
  onAdd,
  isAdding,
  cartFeedback,
}: {
  product: CatalogProduct;
  index: number;
  onView: () => void;
  onAdd: () => void;
  isAdding: boolean;
  cartFeedback?: CartFeedback;
}) {
  const reduceMotion = useReducedMotion();
  const category = product.category.toLowerCase();
  const artwork = category.includes("audio") ? (
    <Headphones />
  ) : category.includes("bag") || category.includes("accessor") ? (
    <ShoppingBag />
  ) : (
    <Package />
  );

  return (
    <motion.article
      initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: reduceMotion ? 0 : index * 0.06 }}
      whileHover={reduceMotion ? undefined : { y: -3 }}
    >
      <Card
        className={cn(
          "h-full overflow-hidden border-[#1d2a24]/10 bg-white/75 shadow-sm shadow-[#1d2a24]/5 transition-shadow hover:shadow-lg hover:shadow-[#1d2a24]/8",
          !product.inStock && "bg-[#eeeae2]/80",
        )}
      >
        <div className="relative grid h-28 place-items-center overflow-hidden border-b border-[#1d2a24]/5 bg-[#e6ebe4] text-[#52675b] [&_svg]:size-12 [&_svg]:stroke-[0.9]">
          <div className="absolute inset-x-8 -top-12 h-24 rounded-full bg-white/65 blur-2xl" />
          <span className="relative">{artwork}</span>
          <span className="absolute bottom-3 left-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#708176]">
            {product.category}
          </span>
        </div>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <Badge
              variant="outline"
              className="border-[#1d2a24]/10 bg-white/40 font-normal text-[#526158]"
            >
              {product.category}
            </Badge>
            <span
              className={cn(
                "flex items-center gap-1.5 text-xs",
                product.inStock ? "text-emerald-700" : "text-amber-700",
              )}
            >
              <span className="size-1.5 rounded-full bg-current" />
              {product.inStock ? "In stock" : "Unavailable"}
            </span>
          </div>
          <h2 className="pt-2 text-lg font-semibold tracking-[-0.025em]">
            {product.name}
          </h2>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col">
          <p className="line-clamp-2 flex-1 text-sm leading-6 text-[#6d766f]">
            {product.description}
          </p>
          <div className="mt-5 flex items-center justify-between gap-3">
            <p className="text-lg font-semibold">
              {formatMoney(product.priceMinor, product.currency)}
            </p>
            <Button
              type="button"
              size="sm"
              aria-label={`Add ${product.name} to Cart`}
              disabled={isAdding}
              onClick={onAdd}
              className="rounded-full bg-[#1d2a24] px-3 text-white hover:bg-[#31463a]"
            >
              {isAdding ? "Adding…" : "Add to Cart"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`View ${product.name} details`}
              onClick={onView}
              className="rounded-full border-[#1d2a24]/10 bg-white/70 px-3 text-[#1d2a24] shadow-none hover:bg-[#1d2a24] hover:text-white"
            >
              View details <ArrowRight />
            </Button>
          </div>
          {cartFeedback ? (
            <p
              role={cartFeedback.kind === "error" ? "alert" : "status"}
              className={cn(
                "mt-3 text-sm",
                cartFeedback.kind === "error"
                  ? "text-red-700"
                  : "text-emerald-700",
              )}
            >
              {cartFeedback.message}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </motion.article>
  );
}
