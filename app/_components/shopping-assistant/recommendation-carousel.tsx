import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/button";
import type { CatalogProduct } from "@/modules/catalog/catalog";
import { ProductCard } from "./product-card";

export function RecommendationCarousel({
  products,
  onViewProduct,
}: {
  products: CatalogProduct[];
  onViewProduct: (product: CatalogProduct) => void;
}) {
  const viewportRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const [bounds, setBounds] = useState({ atStart: true, atEnd: true });

  const updateBounds = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const maximum = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    setBounds({
      atStart: viewport.scrollLeft <= 1,
      atEnd: maximum <= 1 || viewport.scrollLeft >= maximum - 1,
    });
  }, []);

  useEffect(() => {
    updateBounds();
    window.addEventListener("resize", updateBounds);
    return () => window.removeEventListener("resize", updateBounds);
  }, [products.length, updateBounds]);

  function move(direction: -1 | 1) {
    const viewport = viewportRef.current;
    const recommendation = viewport?.firstElementChild;
    if (!(viewport && recommendation instanceof HTMLElement)) return;

    viewport.scrollBy({
      left: direction * recommendation.offsetWidth,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }

  return (
    <div>
      <div className="mb-3 hidden items-center justify-end gap-2 sm:flex">
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Previous Recommendation"
          disabled={bounds.atStart}
          onClick={() => move(-1)}
          className="rounded-full border-[#1d2a24]/10 bg-white/70 shadow-none"
        >
          <ChevronLeft />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Next Recommendation"
          disabled={bounds.atEnd}
          onClick={() => move(1)}
          className="rounded-full border-[#1d2a24]/10 bg-white/70 shadow-none"
        >
          <ChevronRight />
        </Button>
      </div>
      <section
        ref={viewportRef}
        role="region"
        aria-label="Recommendation Set"
        aria-roledescription="carousel"
        tabIndex={0}
        onScroll={updateBounds}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 scroll-smooth outline-none focus-visible:ring-2 focus-visible:ring-[#708176]/50 motion-reduce:scroll-auto"
      >
        {products.map((product, index) => (
          <div
            key={product.id}
            className="w-[min(82vw,20rem)] shrink-0 snap-start sm:w-[min(20rem,calc((100%-1rem)/2.2))] lg:w-[min(20rem,calc((100%-2rem)/2.7))]"
          >
            <ProductCard
              product={product}
              index={index}
              onView={() => onViewProduct(product)}
            />
          </div>
        ))}
      </section>
    </div>
  );
}
