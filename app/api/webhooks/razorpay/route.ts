import { db } from "@/db";
import { createCheckoutAuditLog } from "@/modules/checkout/checkout-audit";
import { createCheckoutOrderStore } from "@/modules/checkout/checkout-store";
import { createProviderNotificationInbox } from "@/modules/checkout/provider-notification-inbox";
import { storefrontRazorpayConfiguration } from "@/modules/payments/razorpay-config";
import { createProviderNotificationRoute } from "./route-factory";

export const POST = createProviderNotificationRoute({
  configuration: storefrontRazorpayConfiguration(),
  createInbox: () =>
    createProviderNotificationInbox({
      database: db,
      orders: createCheckoutOrderStore(db),
      audit: createCheckoutAuditLog(db),
    }),
});
