import { ArrowRight, Headphones, Package, ShoppingBag } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import type { CatalogProduct } from "@/modules/catalog/catalog";
import { CartFeedbackMessage } from "./cart-feedback-message";
import { categoryBlockColor } from "./category-block";
import { StockState } from "./stock-state";
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
      initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: reduceMotion ? 0 : index * 0.04 }}
      className="h-full"
    >
      <Card className={cn("h-full overflow-hidden", !product.inStock && "opacity-90")}>
        <div
          className={cn(
            // Chart tokens are saturated fills, so the block takes the theme's
            // foreground-on-a-bright-fill token rather than the card
            // foreground, which is tuned for the card's white surface.
            "relative grid h-28 shrink-0 place-items-center border-b-2 border-sidebar-border text-accent-foreground [&_svg]:size-12 [&_svg]:stroke-[1.25]",
            categoryBlockColor(product.category),
            !product.inStock && "grayscale",
          )}
        >
          {artwork}
          <span className="absolute bottom-2.5 left-4 eyebrow text-[10px] font-bold text-accent-foreground">
            {product.category}
          </span>
        </div>
        <CardHeader className="pb-3">
          <StockState inStock={product.inStock} />
          <h2 className="text-lg font-semibold leading-snug tracking-tight">
            {product.name}
          </h2>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col">
          <p className="line-clamp-2 flex-1 text-sm leading-6 text-muted-foreground">
            {product.description}
          </p>
          <p className="mt-5 font-mono text-lg font-bold">
            {formatMoney(product.priceMinor, product.currency)}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              aria-label={`Add ${product.name} to Cart`}
              disabled={isAdding}
              onClick={onAdd}
            >
              {isAdding ? "Adding…" : "Add to Cart"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`View ${product.name} details`}
              onClick={onView}
            >
              View details <ArrowRight />
            </Button>
          </div>
          {cartFeedback ? (
            <CartFeedbackMessage feedback={cartFeedback} className="mt-3" />
          ) : null}
        </CardContent>
      </Card>
    </motion.article>
  );
}
