import type { JSDOM } from "jsdom";
import React from "react";
import type { TestContext } from "node:test";
import { answerMediaQueries, installBrowser } from "./browser";
import type { CartView } from "@/modules/cart/cart-view";
import type { CheckoutLaunchResult } from "@/modules/checkout/checkout-launcher";
import type { CheckoutActionEntry } from "@/modules/agent/customer-action-entry";
import type { CheckoutStatusView } from "@/modules/checkout/checkout-status";
import { CHECKOUT_PROPOSAL_LIFETIME_MS } from "@/modules/checkout/checkout-proposal";

/**
 * A Cart that is ready for checkout, priced so every rupee on the proposal can
 * be checked against it by hand.
 */
export const readyCart: CartView = {
  id: "31000000-0000-4000-8000-000000000001",
  version: 4,
  items: [
    {
      productId: "11000000-0000-4000-8000-000000000001",
      productName: "Quiet Buds",
      quantity: 2,
      cartPriceMinor: 349900,
      subtotalMinor: 699800,
    },
    {
      productId: "11000000-0000-4000-8000-000000000002",
      productName: "Trail Runner",
      quantity: 1,
      cartPriceMinor: 899900,
      subtotalMinor: 899900,
    },
  ],
  totalQuantity: 3,
  subtotalMinor: 1599700,
  currency: "INR",
};

export const PROPOSAL_ID = "61000000-0000-4000-8000-000000000001";
export const ORDER_ID = "71000000-0000-4000-8000-000000000001";

/**
 * Builds the checkout entry the proposal route records, prepared "now" so its
 * ten-minute expiry is genuinely in the future during a test.
 */
export function preparedEntry(
  overrides: Partial<CartView> = {},
): CheckoutActionEntry {
  const cart = { ...readyCart, ...overrides };
  const preparedAt = new Date();
  return {
    id: "51000000-0000-4000-8000-000000000009",
    action: "CHECKOUT",
    message: "Check out my Cart",
    provenance: "GENERATED",
    preparation: {
      status: "PREPARED",
      proposal: {
        id: PROPOSAL_ID,
        cartId: cart.id!,
        cartVersion: cart.version,
        currency: "INR",
        lines: cart.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          cartPriceMinor: item.cartPriceMinor,
          lineTotalMinor: item.subtotalMinor,
        })),
        itemsSubtotalMinor: cart.subtotalMinor,
        discountMinor: 0,
        shippingMinor: 0,
        taxMinor: 0,
        checkoutTotalMinor: cart.subtotalMinor,
        policy: {
          result: "REQUIRE_APPROVAL",
          reasonCode: "PAYMENT_REQUIRES_CUSTOMER_APPROVAL",
          explanation:
            "Payment always needs your explicit approval. Nothing is sent to Razorpay until you approve the exact amount below.",
        },
        status: "ACTIVE",
        preparedAt: preparedAt.toISOString(),
        expiresAt: new Date(
          preparedAt.getTime() + CHECKOUT_PROPOSAL_LIFETIME_MS,
        ).toISOString(),
      },
    },
  };
}

export type CheckoutRoutes = {
  /**
   * The authoritative Cart read, when it changes during the test. A captured
   * payment converts the Cart it paid for, so the next read is a fresh, empty
   * one.
   */
  cartRead?: () => Response;
  cartCommand?: (command: { type: string; productId: string }) => Response;
  /** One Conversation Turn, so a test can prove what typed words cannot do. */
  message?: (body: unknown) => Promise<Response> | Response;
  proposal?: () => Promise<Response> | Response;
  approval?: (body: unknown) => Promise<Response> | Response;
  status?: () => Promise<Response> | Response;
  paymentAttempt?: (body: unknown) => Promise<Response> | Response;
  callback?: (body: unknown) => Promise<Response> | Response;
  reconcile?: () => Promise<Response> | Response;
};

/**
 * Renders the Storefront with a stubbed Storefront API and a fake managed
 * Checkout launcher.
 *
 * The launcher is injected rather than loaded, so a test proves the Customer's
 * journey without a network, a Razorpay script, or a credential — exactly the
 * contract the real launcher must satisfy.
 */
export async function openStorefront(
  t: TestContext,
  dom: JSDOM,
  options: {
    cart?: CartView;
    routes?: CheckoutRoutes;
    launch?: () => Promise<CheckoutLaunchResult> | CheckoutLaunchResult;
    /** Which media queries this Customer's viewport matches. */
    matchesMedia?: (query: string) => boolean;
  } = {},
) {
  const scrolls = installBrowser(dom);
  if (options.matchesMedia) answerMediaQueries(dom, options.matchesMedia);
  const cart = options.cart ?? readyCart;
  const routes = options.routes ?? {};
  const requests: string[] = [];
  const launches: unknown[] = [];

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requests.push(`${method} ${url}`);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (url === "/api/agent/conversation") return Response.json({ data: null });
    if (url === "/api/cart" && method === "GET") {
      return routes.cartRead?.() ?? Response.json({ data: cart });
    }
    if (url === "/api/cart" && routes.cartCommand) {
      return routes.cartCommand(body as { type: string; productId: string });
    }
    if (url === "/api/agent/message" && routes.message) {
      return routes.message(body);
    }
    if (url === "/api/checkout/proposal" && routes.proposal) {
      return routes.proposal();
    }
    if (url === "/api/checkout/approval" && routes.approval) {
      return routes.approval(body);
    }
    if (url.startsWith(`/api/checkout/${ORDER_ID}/payment-attempt`) && routes.paymentAttempt) {
      return routes.paymentAttempt(body);
    }
    if (url.startsWith(`/api/checkout/${ORDER_ID}/callback`) && routes.callback) {
      return routes.callback(body);
    }
    if (url.startsWith(`/api/checkout/${ORDER_ID}/reconcile`) && routes.reconcile) {
      return routes.reconcile();
    }
    if (url.startsWith(`/api/checkout/${ORDER_ID}`) && routes.status) {
      return routes.status();
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  };

  const [testingLibrary, userEvent, { ShoppingAssistant }] = await Promise.all([
    import("@testing-library/react"),
    import("@testing-library/user-event").then((module) => module.default),
    import("../shopping-assistant"),
  ]);
  const view = testingLibrary.render(
    React.createElement(ShoppingAssistant, {
      brandName: "Arc",
      resumeConversation: true,
      launchCheckout: async (request: unknown) => {
        launches.push(request);
        return (
          (await options.launch?.()) ?? { outcome: "DISMISSED" as const }
        );
      },
    }),
  );
  t.after(() => {
    testingLibrary.cleanup();
    dom.window.close();
  });

  const user = userEvent.setup({ document: dom.window.document });
  return {
    view,
    user,
    requests,
    launches,
    scrolls,
    within: testingLibrary.within,
    /** Types one Customer message and sends it, as the Composer would. */
    async say(message: string) {
      await user.type(
        await view.findByRole("textbox", { name: /message/i }),
        message,
      );
      await user.click(await view.findByRole("button", { name: /send/i }));
    },
    async openCart() {
      await user.click(
        await view.findByRole("button", { name: `Cart · ${cart.totalQuantity}` }),
      );
      return view.getByRole("dialog", { name: "Your Cart" });
    },
    /**
     * Closes the Cart a settled checkout opened, if it opened one.
     *
     * The Cart is a modal drawer, so while it is open the Conversation behind
     * it is hidden from assistive technology and from a test reading the page.
     * A case about the checkout card itself dismisses the landing first, as the
     * Customer would.
     */
    async dismissCart() {
      if (!view.queryByRole("dialog", { name: "Your Cart" })) return;
      await user.keyboard("{Escape}");
      await testingLibrary.waitFor(() => {
        if (view.queryByRole("dialog", { name: "Your Cart" })) {
          throw new Error("The Cart is still open.");
        }
      });
    },
  };
}

/** A Checkout status view a Customer would see immediately after Approval. */
export function statusView(
  overrides: Partial<CheckoutStatusView> = {},
): CheckoutStatusView {
  return {
    orderId: ORDER_ID,
    status: "PAYMENT_SETUP",
    currency: "INR",
    totalMinor: readyCart.subtotalMinor,
    providerOperation: {
      status: "SUCCEEDED",
      reconciliationReadsUsed: 0,
      canCheckStatus: false,
    },
    providerOrder: {
      providerOrderId: "order_TEST0000000001",
      amountMinor: readyCart.subtotalMinor,
      currency: "INR",
      keyId: "rzp_test_examplekey",
    },
    launchesUsed: 0,
    launchesRemaining: 3,
    timeline: [],
    ...overrides,
  };
}
