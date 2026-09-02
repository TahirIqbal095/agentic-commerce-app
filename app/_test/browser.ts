import type { JSDOM } from "jsdom";

/**
 * Installs one JSDOM window as the globals React and Testing Library expect.
 *
 * Storefront behavior tests drive real Customer interactions, so the window
 * also carries the pointer, animation, and media APIs the drawer primitives
 * use.
 *
 * @param dom - Window to install for the duration of one test.
 */
export function installBrowser(dom: JSDOM) {
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
    scrollTo: { configurable: true, value() {} },
  });
  Object.assign(dom.window.HTMLElement.prototype, {
    hasPointerCapture() {
      return false;
    },
    setPointerCapture() {},
    releasePointerCapture() {},
  });
}
