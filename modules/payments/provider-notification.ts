/**
 * Authenticated, deduplicated facts Razorpay delivers asynchronously.
 *
 * A Provider Notification is evidence, not an instruction. It is authenticated
 * over its untouched bytes before it is parsed at all, deduplicated by
 * Razorpay's own event ID so a repeated delivery cannot be applied twice, and
 * held in a durable inbox when it arrives before the Provider Order it talks
 * about exists. Under ADR-0014 it is projected monotonically: a captured
 * Provider Payment or a paid Order can never be regressed by a later, stale, or
 * out-of-order delivery.
 *
 * Under ADR-0015 only selected fields are retained. The raw payload, its
 * signature, and any contact or instrument data it carried are never stored.
 */

export type ProviderNotificationFacts = {
  eventId: string;
  eventType: string;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  providerStatus: string | null;
  amountMinor: number | null;
  currency: string | null;
  occurredAt: Date;
};

export type ProviderNotificationVerdict =
  | { status: "AUTHENTIC"; facts: ProviderNotificationFacts }
  | { status: "UNAUTHENTICATED" }
  | { status: "MALFORMED" };

/**
 * Authenticates one delivery and reads the facts out of it.
 *
 * The order of operations is the security property: the HMAC is computed over
 * the exact bytes received, using the separate webhook secret and a
 * constant-time comparison, and the body is parsed only once that succeeds. A
 * forged delivery therefore never reaches the JSON parser, let alone the
 * database.
 *
 * @param rawBody - The request body exactly as received, unparsed.
 * @param signature - The claimed signature header, or `null` when absent.
 * @param verifySignature - The configuration's constant-time verifier.
 */
export function readProviderNotification(
  rawBody: Uint8Array,
  signature: string | null,
  verifySignature: (rawBody: Uint8Array, signature: string) => boolean,
): ProviderNotificationVerdict {
  if (!signature || !verifySignature(rawBody, signature)) {
    return { status: "UNAUTHENTICATED" };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(rawBody).toString("utf8"));
  } catch {
    return { status: "MALFORMED" };
  }
  if (typeof payload !== "object" || payload === null) {
    return { status: "MALFORMED" };
  }

  const event = payload as Record<string, unknown>;
  const eventId = event.id;
  const eventType = event.event;
  if (typeof eventId !== "string" || typeof eventType !== "string") {
    return { status: "MALFORMED" };
  }

  const entity = paymentEntity(event);
  const createdAt = event.created_at;
  return {
    status: "AUTHENTIC",
    facts: {
      eventId,
      eventType,
      providerOrderId: readString(entity?.order_id) ?? readOrderId(event),
      providerPaymentId: readString(entity?.id),
      providerStatus: readString(entity?.status),
      amountMinor: Number.isSafeInteger(entity?.amount)
        ? (entity?.amount as number)
        : null,
      currency: readString(entity?.currency),
      occurredAt: Number.isSafeInteger(createdAt)
        ? new Date((createdAt as number) * 1000)
        : new Date(),
    },
  };
}

function paymentEntity(
  event: Record<string, unknown>,
): Record<string, unknown> | null {
  const payload = event.payload as Record<string, unknown> | undefined;
  const payment = payload?.payment as Record<string, unknown> | undefined;
  const entity = payment?.entity;
  return typeof entity === "object" && entity !== null
    ? (entity as Record<string, unknown>)
    : null;
}

function readOrderId(event: Record<string, unknown>): string | null {
  const payload = event.payload as Record<string, unknown> | undefined;
  const order = payload?.order as Record<string, unknown> | undefined;
  const entity = order?.entity as Record<string, unknown> | undefined;
  return readString(entity?.id);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Whether these facts say the payment was collected.
 *
 * Razorpay reports capture in more than one way, and only capture makes an
 * Order paid, so the test is explicit rather than "not a failure".
 */
export function notificationReportsCapture(
  facts: ProviderNotificationFacts,
): boolean {
  return (
    facts.providerStatus === "captured" ||
    facts.eventType === "payment.captured" ||
    facts.eventType === "order.paid"
  );
}
