"use client";

import * as React from "react";
import useEmblaCarousel, {
  type UseEmblaCarouselType,
} from "embla-carousel-react";

import { cn } from "@/lib/utils";

type CarouselApi = UseEmblaCarouselType[1];
type CarouselOptions = Parameters<typeof useEmblaCarousel>[0];

type CarouselContextValue = {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0];
  scrollPrev: () => void;
  scrollNext: () => void;
  canScrollPrev: boolean;
  canScrollNext: boolean;
};

const CarouselContext = React.createContext<CarouselContextValue | null>(null);

function useCarousel() {
  const context = React.useContext(CarouselContext);
  if (!context) {
    throw new Error("Carousel parts must be used within a <Carousel />");
  }
  return context;
}

/**
 * A horizontal, keyboard-reachable list of slides.
 *
 * Scroll arithmetic, bounds tracking, and resize handling belong to the
 * carousel library rather than to the Storefront.
 */
function Carousel({
  opts,
  setApi,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  opts?: CarouselOptions;
  setApi?: (api: CarouselApi) => void;
}) {
  const [carouselRef, api] = useEmblaCarousel({
    align: "start",
    containScroll: "trimSnaps",
    ...opts,
  });
  const [canScrollPrev, setCanScrollPrev] = React.useState(false);
  const [canScrollNext, setCanScrollNext] = React.useState(false);

  const scrollPrev = React.useCallback(() => api?.scrollPrev(), [api]);
  const scrollNext = React.useCallback(() => api?.scrollNext(), [api]);

  React.useEffect(() => {
    if (!api) return;
    setApi?.(api);
    const sync = () => {
      setCanScrollPrev(api.canScrollPrev());
      setCanScrollNext(api.canScrollNext());
    };
    sync();
    api.on("reInit", sync).on("select", sync);
    return () => {
      api.off("reInit", sync).off("select", sync);
    };
  }, [api, setApi]);

  return (
    <CarouselContext.Provider
      value={{ carouselRef, scrollPrev, scrollNext, canScrollPrev, canScrollNext }}
    >
      <div
        data-slot="carousel"
        className={cn("relative", className)}
        {...props}
      >
        {children}
      </div>
    </CarouselContext.Provider>
  );
}

function CarouselContent({
  className,
  viewportProps,
  ...props
}: React.ComponentProps<"div"> & {
  viewportProps?: React.ComponentProps<"div">;
}) {
  const { carouselRef } = useCarousel();
  return (
    <div ref={carouselRef} className="overflow-hidden" {...viewportProps}>
      <div
        data-slot="carousel-content"
        className={cn("flex gap-4", className)}
        {...props}
      />
    </div>
  );
}

function CarouselItem({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="carousel-item"
      role="group"
      aria-roledescription="slide"
      className={cn("min-w-0 shrink-0 grow-0", className)}
      {...props}
    />
  );
}

export { Carousel, CarouselContent, CarouselItem, useCarousel };
export type { CarouselApi };
