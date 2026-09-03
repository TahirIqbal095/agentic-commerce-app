/**
 * The server-only gate that decides whether this Brand may run the Razorpay
 * Test Checkout demonstration at all.
 *
 * Razorpay Test Mode is mandatory. A live key, an absent credential, or a
 * webhook secret that is not distinct from the API secret disables checkout
 * with an explanation, while the rest of the Storefront stays available. That
 * is deliberate: a demonstration that silently reached a live Payment Account
 * would move real money, so the failure mode is "no checkout", never "checkout
 * against whatever was configured".
 *
 * Nothing here may be imported by browser code. The Test API secret and the
 * webhook signing secret are read from separate unprefixed environment
 * variables, are never persisted, and are never placed in an Audit Event, a
 * Checkout Timeline, or a Customer-safe explanation.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const RAZORPAY_TEST_KEY_PREFIX = "rzp_test_";

export type RazorpayDisabledReasonCode =
  | "RAZORPAY_CREDENTIALS_ABSENT"
  | "RAZORPAY_KEY_NOT_TEST_MODE"
  | "RAZORPAY_SECRETS_NOT_DISTINCT";

export type RazorpayTestConfiguration =
  | {
      status: "ENABLED";
      /** Razorpay's publishable Test key ID. Safe to send to the browser. */
      keyId: string;
      environmentMode: "TEST";
      /**
       * Builds the Basic authorization header value for one MCP operation.
       *
       * It is a function rather than a stored string so the secret exists only
       * for the moment a request needs it, and so serializing the
       * configuration — into a log, a response, or an Audit Event — cannot
       * carry the credential with it.
       */
      basicAuthorization: () => string;
      /**
       * Verifies one browser callback against the stored Provider Order.
       *
       * The secret never leaves this module: callers hand over the claim and
       * receive a verdict, so no route, adapter, or Audit Event can hold the
       * material needed to forge one.
       */
      verifyCheckoutSignature: (
        providerOrderId: string,
        providerPaymentId: string,
        signature: string,
      ) => boolean;
      /**
       * Verifies one Provider Notification's HMAC over its untouched bytes,
       * using the separate webhook secret rather than the API secret.
       */
      verifyNotificationSignature: (
        rawBody: Uint8Array,
        signature: string,
      ) => boolean;
    }
  | {
      status: "DISABLED";
      reasonCode: RazorpayDisabledReasonCode;
      explanation: string;
    };

const DISABLED_EXPLANATIONS: Record<RazorpayDisabledReasonCode, string> = {
  RAZORPAY_CREDENTIALS_ABSENT:
    "Checkout is unavailable because this Storefront has no Razorpay Test Mode configuration. You can keep browsing and building your Cart.",
  RAZORPAY_KEY_NOT_TEST_MODE:
    "Checkout is unavailable because this Storefront is configured with a key that is not a Razorpay Test Mode key. This release collects test payments only.",
  RAZORPAY_SECRETS_NOT_DISTINCT:
    "Checkout is unavailable because this Storefront's Razorpay Test Mode configuration is incomplete. You can keep browsing and building your Cart.",
};

/**
 * Reads and judges the Brand's Razorpay Test Mode configuration.
 *
 * @param environment - The process environment to read, injected so a test
 *   proves each disabling condition without mutating global state.
 * @returns Enabled credentials, or the reason checkout is unavailable.
 */
export function readRazorpayTestConfiguration(
  environment: Record<string, string | undefined>,
): RazorpayTestConfiguration {
  const keyId = environment.RAZORPAY_TEST_KEY_ID?.trim() ?? "";
  const keySecret = environment.RAZORPAY_TEST_KEY_SECRET?.trim() ?? "";
  const webhookSecret = environment.RAZORPAY_WEBHOOK_SECRET?.trim() ?? "";

  if (keyId === "" || keySecret === "" || webhookSecret === "") {
    return disabled("RAZORPAY_CREDENTIALS_ABSENT");
  }
  if (!keyId.startsWith(RAZORPAY_TEST_KEY_PREFIX)) {
    return disabled("RAZORPAY_KEY_NOT_TEST_MODE");
  }
  if (webhookSecret === keySecret) {
    return disabled("RAZORPAY_SECRETS_NOT_DISTINCT");
  }

  return {
    status: "ENABLED",
    keyId,
    environmentMode: "TEST",
    basicAuthorization: () =>
      `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
    verifyCheckoutSignature: (providerOrderId, providerPaymentId, signature) =>
      matchesHmac(
        keySecret,
        Buffer.from(`${providerOrderId}|${providerPaymentId}`, "utf8"),
        signature,
      ),
    verifyNotificationSignature: (rawBody, signature) =>
      matchesHmac(webhookSecret, Buffer.from(rawBody), signature),
  };
}

/**
 * The Storefront's own Razorpay configuration, read once per server process.
 */
export function storefrontRazorpayConfiguration(): RazorpayTestConfiguration {
  return readRazorpayTestConfiguration(process.env);
}

/**
 * Compares one claimed signature against the HMAC-SHA256 this Storefront
 * computes, in constant time.
 *
 * A length mismatch is answered `false` before any comparison, because
 * `timingSafeEqual` throws on unequal lengths and a thrown error would leak
 * that fact through timing or a stack trace. A malformed hexadecimal claim is
 * simply not a signature.
 */
function matchesHmac(
  secret: string,
  payload: Buffer,
  signature: string,
): boolean {
  const expected = createHmac("sha256", secret).update(payload).digest();
  let claimed: Buffer;
  try {
    claimed = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  return (
    claimed.length === expected.length && timingSafeEqual(claimed, expected)
  );
}

function disabled(
  reasonCode: RazorpayDisabledReasonCode,
): RazorpayTestConfiguration {
  return {
    status: "DISABLED",
    reasonCode,
    explanation: DISABLED_EXPLANATIONS[reasonCode],
  };
}
