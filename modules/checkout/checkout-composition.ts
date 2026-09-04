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
import { createCheckoutFaultInjector } from "./checkout-fault";
import {
  createCheckoutAuthority,
  type CheckoutAuthority,
} from "./checkout-authority";
import {
  createCheckoutOrderStore,
  createCheckoutProposalStore,
} from "./checkout-store";
import { createProviderNotificationInbox } from "./provider-notification-inbox";

export function storefrontRazorpayGateway(): RazorpayProviderGateway {
  const configuration = storefrontRazorpayConfiguration();
  const loseNextWriteResponse = createCheckoutFaultInjector(process.env);
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
  const orders = createCheckoutOrderStore(db);
  const audit = createCheckoutAuditLog(db);
  return createCheckoutAuthority({
    guestSessionId: guestSession.id,
    brandName,
    cartReview: createCartReviewRead(guestSession.id, createCartModule),
    proposals: createCheckoutProposalStore(guestSession.id, db),
    orders,
    provider: storefrontRazorpayGateway(),
    configuration: storefrontRazorpayConfiguration(),
    audit,
    // The webhook route and the authority hold two halves of one inbox, so a
    // delivery that raced ahead of the Provider Order is applied by whichever
    // of the two learns about that Provider Order first.
    notifications: createProviderNotificationInbox({
      database: db,
      orders,
      audit,
    }),
  });
}
