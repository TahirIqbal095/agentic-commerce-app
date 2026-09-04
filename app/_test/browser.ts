import type { JSDOM } from "jsdom";

/**
 * A layout observer that reports nothing.
 *
 * JSDOM lays nothing out, so the carousel and scroll-area primitives have no
 * geometry to observe. They only need the constructor to exist; a Storefront
 * behavior test asserts what a Customer can perceive, never a measured size.
 */
class InertObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

/**
 * Installs one JSDOM window as the globals React and Testing Library expect.
 *
 * Storefront behavior tests drive real Customer interactions, so the window
 * also carries the pointer, animation, layout, and media APIs the drawer and
 * carousel primitives use.
 *
 * JSDOM lays nothing out, so scrolling leaves no position a test could read.
 * The window's scroll is therefore a recording stub rather than a silent
 * no-op: what the Storefront asked for, and whether it asked at all, is what a
 * test asserting that the Transcript follows the Conversation can honestly
 * check.
 *
 * @param dom - Window to install for the duration of one test.
 * @returns Every scroll the Storefront requested, in order.
 */
export function installBrowser(dom: JSDOM) {
  const scrolls: ScrollToOptions[] = [];
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    getComputedStyle: dom.window.getComputedStyle,
    IntersectionObserver: InertObserver,
    ResizeObserver: InertObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: dom.window.navigator,
  });
  Object.defineProperties(dom.window, {
    requestAnimationFrame: {
      configurable: true,
      value: (callback: FrameRequestCallback) =>
        setTimeout(() => callback(Date.now()), 0),
    },
    cancelAnimationFrame: { configurable: true, value: clearTimeout },
    matchMedia: {
      configurable: true,
      value: () => ({
        matches: false,
        media: "",
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {
          return false;
        },
      }),
    },
    scrollTo: {
      configurable: true,
      value(options: ScrollToOptions) {
        scrolls.push(options);
      },
    },
    IntersectionObserver: { configurable: true, value: InertObserver },
    ResizeObserver: { configurable: true, value: InertObserver },
  });
  Object.assign(dom.window.HTMLElement.prototype, {
    hasPointerCapture() {
      return false;
    },
    setPointerCapture() {},
    releasePointerCapture() {},
  });
  return scrolls;
}

/**
 * Answers the window's media queries with a predicate.
 *
 * The Storefront resolves the Checkout Timeline's breakpoint in JavaScript, so
 * a test about a wide viewport has to say which queries a wide viewport
 * matches. Every other query keeps its own answer, so widening the viewport
 * does not accidentally also claim the Customer asked for reduced motion.
 *
 * @param dom - Window the Storefront will be rendered into.
 * @param matches - Whether one query matches.
 */
export function answerMediaQueries(
  dom: JSDOM,
  matches: (query: string) => boolean,
) {
  Object.defineProperty(dom.window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: matches(query),
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    }),
  });
}

/**
 * Puts the Customer at one position in a Transcript of a given height, and
 * tells the window about it the way a real scroll would.
 *
 * JSDOM reports a zero-height document, which reads as being at the bottom of
 * an empty page. A test about a Customer who has scrolled up to re-read an
 * earlier Recommendation has to describe both the Transcript's height and
 * where in it they are looking.
 *
 * @param dom - Window the Storefront is rendered into.
 * @param position - The Transcript's height and the Customer's place in it.
 */
export function scrollTranscriptTo(
  dom: JSDOM,
  position: { documentHeight: number; scrollY: number },
) {
  Object.defineProperty(dom.window.document.documentElement, "scrollHeight", {
    configurable: true,
    value: position.documentHeight,
  });
  Object.defineProperty(dom.window, "scrollY", {
    configurable: true,
    value: position.scrollY,
  });
  dom.window.dispatchEvent(new dom.window.Event("scroll"));
}
