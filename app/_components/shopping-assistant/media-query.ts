import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether the browser currently matches one media query.
 *
 * A breakpoint that decides *where* something renders is resolved here rather
 * than by rendering both arrangements and hiding one with CSS. Rendering both
 * would put two copies of the same content in the document, which reads twice
 * to assistive technology and makes "this appears exactly once" unassertable.
 *
 * The server has no viewport, so a query matches nothing until the Storefront
 * has mounted. Anything decided this way must therefore be supplementary to
 * the page rather than part of its first paint.
 *
 * @param query - The media query to watch.
 * @returns Whether it matches right now, re-rendering when that changes.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const queryList = window.matchMedia(query);
      queryList.addEventListener("change", onChange);
      return () => queryList.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
