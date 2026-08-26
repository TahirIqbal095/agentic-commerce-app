import { ArrowRight, Headphones, ShoppingBag } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import type { CatalogProduct } from "@/modules/catalog/catalog";

export function ProductCard({
  product,
  index,
  onView,
}: {
  product: CatalogProduct;
  index: number;
  onView: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const icon = index % 2 === 0 ? <Headphones /> : <ShoppingBag />;

  return (
    <motion.article
      initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: reduceMotion ? 0 : index * 0.06 }}
      whileHover={reduceMotion ? undefined : { y: -3 }}
    >
      <Card className="h-full overflow-hidden border-[#1d2a24]/10 bg-white/62 shadow-none transition-shadow hover:shadow-xl hover:shadow-[#1d2a24]/8">
        <div className="grid aspect-[1.65] place-items-center border-b border-[#1d2a24]/5 bg-[#e5e1d8] text-[#708176] [&_svg]:size-16 [&_svg]:stroke-[0.75]">
          {icon}
        </div>
        <CardHeader>
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
          <h2 className="pt-3 text-xl font-semibold tracking-[-0.025em]">
            {product.name}
          </h2>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col">
          <p className="line-clamp-2 flex-1 text-sm leading-6 text-[#6d766f]">
            {product.description}
          </p>
          <div className="mt-6 flex items-center justify-between">
            <p className="text-lg font-semibold">
              {formatMoney(product.priceMinor, product.currency)}
            </p>
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label={`View ${product.name}`}
              onClick={onView}
              className="rounded-full border-[#1d2a24]/10 bg-white/40 text-[#1d2a24] shadow-none hover:bg-[#1d2a24] hover:text-white"
            >
              <ArrowRight />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.article>
  );
}
