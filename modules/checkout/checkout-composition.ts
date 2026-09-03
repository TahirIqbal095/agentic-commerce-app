/**
 * The Storefront's one composition root for Conversational Checkout.
 *
 * Every checkout route builds its authority here, so the Payment Account, the
 * outbound Razorpay path, the audit log, and the guest-owned stores are chosen
 * in exactly one place. A route cannot accidentally reach a different provider
 * gateway, and the deterministic fault used to demonstrate recovery is wired in
 * only when the environment explicitly asks for it.
 *
 * This module is server-only: it reads credentials and imports the database.
 */

import { db } from "@/db";
import { createCartModule } from "@/modules/cart/cart";
import { createCartReviewRead } from "@/modules/cart/cart-inspection";
import { storefrontRazorpayConfiguration } from "@/modules/payments/razorpay-config";
import {
  createHostedRazorpayMcpClient,
  createRazorpayMcpAdapter,
} from "@/modules/payments/razorpay-mcp-adapter";
import type { RazorpayProviderGateway } from "@/modules/payments/razorpay-gateway";
import type { GuestSession } from "@/modules/identity/guest-session";
import { createCheckoutAuditLog } from "./checkout-audit";
import {
  createCheckoutAuthority,
  type CheckoutAuthority,
} from "./checkout-authority";
import {
  createCheckoutOrderStore,
  createCheckoutProposalStore,
} from "./checkout-store";

/**
 * Whether the deterministic post-dispatch timeout fault is armed.
 *
 * It exists so the graceful recovery from an Unknown Provider Outcome can be
 * demonstrated and tested repeatably. It is available only outside production
 * and only when the environment sets it, so no Customer input and no production
 * build can activate it.
 */
function faultInjector(): (() => boolean) | undefined {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.CHECKOUT_FAULT !== "LOSE_CREATE_ORDER_RESPONSE"
  ) {
    return undefined;
  }
  let remaining = 1;
  return () => remaining-- > 0;
}

export function storefrontRazorpayGateway(): RazorpayProviderGateway {
  const configuration = storefrontRazorpayConfiguration();
  const loseNextWriteResponse = faultInjector();
  return createRazorpayMcpAdapter({
    basicAuthorization: () =>
      configuration.status === "ENABLED"
        ? configuration.basicAuthorization()
        : "",
    createClient: createHostedRazorpayMcpClient,
    ...(loseNextWriteResponse ? { loseNextWriteResponse } : {}),
  });
}

export function createStorefrontCheckoutAuthority(
  guestSession: GuestSession,
  brandName = "the Storefront",
): CheckoutAuthority {
  return createCheckoutAuthority({
    guestSessionId: guestSession.id,
    brandName,
    cartReview: createCartReviewRead(guestSession.id, createCartModule),
    proposals: createCheckoutProposalStore(guestSession.id, db),
    orders: createCheckoutOrderStore(db),
    provider: storefrontRazorpayGateway(),
    configuration: storefrontRazorpayConfiguration(),
    audit: createCheckoutAuditLog(db),
  });
}
