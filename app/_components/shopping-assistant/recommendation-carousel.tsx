import { ChevronLeft, ChevronRight } from "lucide-react";
import { useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  useCarousel,
} from "@/components/ui/carousel";
import type { CatalogProduct } from "@/modules/catalog/catalog";
import { ProductCard } from "./product-card";
import { RECOMMENDATION_SLOT_WIDTH } from "./recommendation-slot";
import type { CartFeedback } from "./types";

function CarouselControls() {
  const { scrollPrev, scrollNext, canScrollPrev, canScrollNext } =
    useCarousel();

  return (
    <div className="mb-3 hidden items-center justify-end gap-2 sm:flex">
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        aria-label="Previous Recommendation"
        disabled={!canScrollPrev}
        onClick={scrollPrev}
      >
        <ChevronLeft />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        aria-label="Next Recommendation"
        disabled={!canScrollNext}
        onClick={scrollNext}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

export function RecommendationCarousel({
  products,
  onViewProduct,
  onAddProduct,
  addingProductIds,
  cartFeedback,
}: {
  products: CatalogProduct[];
  onViewProduct: (product: CatalogProduct) => void;
  onAddProduct: (product: CatalogProduct) => void;
  addingProductIds: ReadonlySet<string>;
  cartFeedback: Record<string, CartFeedback>;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <Carousel
      role="region"
      aria-label="Recommendation Set"
      aria-roledescription="carousel"
      opts={{ duration: reduceMotion ? 0 : 20 }}
    >
      <CarouselControls />
      <CarouselContent className="py-2 pl-1">
        {products.map((product, index) => (
          <CarouselItem
            key={product.id}
            className={RECOMMENDATION_SLOT_WIDTH}
          >
            <ProductCard
              product={product}
              index={index}
              onView={() => onViewProduct(product)}
              onAdd={() => onAddProduct(product)}
              isAdding={addingProductIds.has(product.id)}
              cartFeedback={cartFeedback[product.id]}
            />
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  );
}
