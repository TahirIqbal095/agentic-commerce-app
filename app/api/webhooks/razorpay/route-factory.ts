import type { RazorpayTestConfiguration } from "@/modules/payments/razorpay-config";
import { readProviderNotification } from "@/modules/payments/provider-notification";
import type { ProviderNotificationInbox } from "@/modules/checkout/provider-notification-inbox";

const RAZORPAY_SIGNATURE_HEADER = "x-razorpay-signature";

/**
 * Receives Razorpay's Provider Notifications.
 *
 * The request body is read once as raw bytes and authenticated before it is
 * parsed, so a forged or tampered delivery never reaches the parser or the
 * database. The status codes are part of the contract with Razorpay's retry
 * behavior: an unauthenticated delivery is 401, an authenticated but malformed
 * one is 400 and will never succeed on retry, a durable-storage failure is 500
 * so Razorpay tries again, and both a newly accepted event and a duplicate are
 * 2xx because both mean "we have this".
 *
 * There is no Guest Session here: Razorpay is not a browser, and the evidence
 * it delivers belongs to protected commerce records that outlive any session.
 */
export function createProviderNotificationRoute(options: {
  configuration: RazorpayTestConfiguration;
  createInbox: () => ProviderNotificationInbox;
}) {
  return async function POST(request: Request): Promise<Response> {
    if (options.configuration.status === "DISABLED") {
      return new Response(null, { status: 401 });
    }

    const rawBody = new Uint8Array(await request.arrayBuffer());
    const verdict = readProviderNotification(
      rawBody,
      request.headers.get(RAZORPAY_SIGNATURE_HEADER),
      options.configuration.verifyNotificationSignature,
    );
    if (verdict.status === "UNAUTHENTICATED") {
      return new Response(null, { status: 401 });
    }
    if (verdict.status === "MALFORMED") {
      return new Response(null, { status: 400 });
    }

    try {
      const receipt = await options.createInbox().receive(verdict.facts);
      return Response.json({ status: receipt.status }, { status: 200 });
    } catch (error) {
      console.error("Provider Notification could not be stored", error);
      return new Response(null, { status: 500 });
    }
  };
}
