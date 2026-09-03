import {
  dataResponse,
  errorResponse,
  unexpectedErrorResponse,
} from "@/lib/http/responses";
import { isUuid } from "@/lib/validation";
import type { ConversationState } from "@/modules/agent/conversation-state";
import type {
  CheckoutAuthority,
  CheckoutRefusal,
} from "@/modules/checkout/checkout-authority";
import type { CheckoutLaunchResult } from "@/modules/checkout/checkout-launcher";
import {
  createGuestSessionRoute,
  type GuestSession,
  type GuestSessionStore,
} from "@/modules/identity/guest-session";

/**
 * The narrow, guest-owned commands and queries Conversational Checkout offers.
 *
 * Each authority boundary is its own route rather than one broad checkout
 * endpoint, so preparation, Approval, reconciliation, opening a Payment
 * Attempt, verifying a callback, and reading the Checkout Timeline can each be
 * validated, rate-shaped, and tested on its own terms. Every route runs inside
 * the Guest Session boundary, and every refusal is projected as a safe code and
 * a Customer-readable message rather than as an internal error.
 */
export type CheckoutRouteOptions = {
  store: GuestSessionStore;
  createAuthority: (guestSession: GuestSession) => CheckoutAuthority;
  now?: () => Date;
  issueToken?: () => string;
};

type CheckoutProposalRouteOptions = CheckoutRouteOptions & {
  createState: (
    guestSession: GuestSession,
  ) => Pick<ConversationState, "recordCheckout">;
};

type OrderRouteContext = { params: Promise<{ orderId: string }> };

function sessionOptions(options: CheckoutRouteOptions) {
  return {
    store: options.store,
    ...(options.now ? { now: options.now } : {}),
    ...(options.issueToken ? { issueToken: options.issueToken } : {}),
  };
}

function isRefusal(value: unknown): value is CheckoutRefusal {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { status?: unknown }).status === "REFUSED"
  );
}

/**
 * Projects one authority refusal as an HTTP answer.
 *
 * A refusal is a decision the Customer can read and act on, so it carries the
 * authority's own reason code and message. Nothing internal is added.
 */
function refusalResponse(refusal: CheckoutRefusal): Response {
  return errorResponse(
    { code: refusal.reasonCode, message: refusal.message, details: {} },
    refusal.reasonCode === "ORDER_NOT_FOUND" ? 404 : 409,
  );
}

function invalidCommand(message: string, field?: string): Response {
  return errorResponse(
    {
      code: "INVALID_CHECKOUT_COMMAND",
      message,
      details: field ? { field } : {},
    },
    400,
  );
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Prepares one Checkout Proposal and records it in the Transcript.
 *
 * Repeating the same Customer command key returns the same proposal, so a
 * retried or double-submitted Check out never leaves two proposals or two
 * Transcript entries behind.
 */
export function createCheckoutProposalRoute(
  options: CheckoutProposalRouteOptions,
) {
  return createGuestSessionRoute(async (request, guestSession) => {
    const body = await readJson(request);
    const commandKey = body?.commandKey;
    if (typeof commandKey !== "string" || !isUuid(commandKey)) {
      return invalidCommand("commandKey must be a UUID.", "commandKey");
    }
    try {
      const preparation = await options
        .createAuthority(guestSession)
        .prepare({ commandKey });
      const entry = await options
        .createState(guestSession)
        .recordCheckout(preparation);
      return dataResponse(entry);
    } catch (error) {
      console.error("Checkout preparation failed", error);
      return unexpectedErrorResponse();
    }
  }, sessionOptions(options));
}

/**
 * Consumes one Customer Approval for one exact Checkout Proposal.
 *
 * The command carries the proposal, the amount the Customer was shown, and an
 * idempotency key. Typed conversational text can never reach this route: only
 * the Approval control submits it, and the authority still revalidates every
 * commercial fact before an Order exists.
 */
export function createCheckoutApprovalRoute(options: CheckoutRouteOptions) {
  return createGuestSessionRoute(async (request, guestSession) => {
    const body = await readJson(request);
    if (!body) return invalidCommand("Request body must be valid JSON.");
    const { proposalId, approvalKey, approvedTotalMinor, currency } = body;
    if (typeof proposalId !== "string" || !isUuid(proposalId)) {
      return invalidCommand("proposalId must be a UUID.", "proposalId");
    }
    if (typeof approvalKey !== "string" || !isUuid(approvalKey)) {
      return invalidCommand("approvalKey must be a UUID.", "approvalKey");
    }
    if (
      !Number.isSafeInteger(approvedTotalMinor) ||
      Number(approvedTotalMinor) <= 0
    ) {
      return invalidCommand(
        "approvedTotalMinor must be a positive whole number of paise.",
        "approvedTotalMinor",
      );
    }
    if (typeof currency !== "string") {
      return invalidCommand("currency must be a string.", "currency");
    }

    try {
      const outcome = await options.createAuthority(guestSession).approve({
        proposalId,
        approvalKey,
        approvedTotalMinor: Number(approvedTotalMinor),
        currency,
      });
      return isRefusal(outcome)
        ? refusalResponse(outcome)
        : dataResponse(outcome.checkout);
    } catch (error) {
      console.error("Checkout approval failed", error);
      return unexpectedErrorResponse();
    }
  }, sessionOptions(options));
}

/** Reads one checkout's authoritative state and its Checkout Timeline. */
export function createCheckoutStatusRoute(options: CheckoutRouteOptions) {
  return createGuestSessionRoute<[OrderRouteContext]>(
    async (_request, guestSession, context) => {
      const { orderId } = await context.params;
      if (!isUuid(orderId)) return invalidCommand("orderId must be a UUID.");
      try {
        const checkout = await options
          .createAuthority(guestSession)
          .readStatus(orderId);
        return checkout
          ? dataResponse(checkout)
          : errorResponse(
              {
                code: "ORDER_NOT_FOUND",
                message: "That checkout is not available.",
                details: {},
              },
              404,
            );
      } catch (error) {
        console.error("Checkout status read failed", error);
        return unexpectedErrorResponse();
      }
    },
    sessionOptions(options),
  );
}

/** Spends one bounded reconciliation read after an Unknown Provider Outcome. */
export function createCheckoutReconcileRoute(options: CheckoutRouteOptions) {
  return createGuestSessionRoute<[OrderRouteContext]>(
    async (_request, guestSession, context) => {
      const { orderId } = await context.params;
      if (!isUuid(orderId)) return invalidCommand("orderId must be a UUID.");
      try {
        const outcome = await options
          .createAuthority(guestSession)
          .reconcile(orderId);
        return isRefusal(outcome)
          ? refusalResponse(outcome)
          : dataResponse(outcome);
      } catch (error) {
        console.error("Checkout reconciliation failed", error);
        return unexpectedErrorResponse();
      }
    },
    sessionOptions(options),
  );
}

/**
 * Opens one Payment Attempt against the verified Provider Order.
 *
 * The response carries only the publishable Test key ID and the verified
 * Provider Order, because that is all the browser needs to open Razorpay's own
 * interface. No secret crosses this boundary.
 */
export function createPaymentAttemptRoute(options: CheckoutRouteOptions) {
  return createGuestSessionRoute<[OrderRouteContext]>(
    async (_request, guestSession, context) => {
      const { orderId } = await context.params;
      if (!isUuid(orderId)) return invalidCommand("orderId must be a UUID.");
      try {
        const outcome = await options
          .createAuthority(guestSession)
          .openPaymentAttempt(orderId);
        return isRefusal(outcome)
          ? refusalResponse(outcome)
          : dataResponse(outcome);
      } catch (error) {
        console.error("Payment Attempt could not be opened", error);
        return unexpectedErrorResponse();
      }
    },
    sessionOptions(options),
  );
}

/**
 * Records what one Payment Attempt produced.
 *
 * Every identifier in the request is an untrusted browser claim. The authority
 * verifies the signature against the stored Provider Order and then reads
 * authoritative Razorpay state; nothing here decides that an Order is paid.
 */
export function createCheckoutCallbackRoute(options: CheckoutRouteOptions) {
  return createGuestSessionRoute<[OrderRouteContext]>(
    async (request, guestSession, context) => {
      const { orderId } = await context.params;
      if (!isUuid(orderId)) return invalidCommand("orderId must be a UUID.");
      const body = await readJson(request);
      if (!body) return invalidCommand("Request body must be valid JSON.");
      const attemptId = body.attemptId;
      if (typeof attemptId !== "string" || !isUuid(attemptId)) {
        return invalidCommand("attemptId must be a UUID.", "attemptId");
      }
      const result = parseLaunchResult(body.result);
      if (!result) {
        return invalidCommand("result must be a Checkout outcome.", "result");
      }

      try {
        const outcome = await options
          .createAuthority(guestSession)
          .resolvePaymentAttempt(orderId, attemptId, result);
        return isRefusal(outcome)
          ? refusalResponse(outcome)
          : dataResponse(outcome);
      } catch (error) {
        console.error("Payment result could not be recorded", error);
        return unexpectedErrorResponse();
      }
    },
    sessionOptions(options),
  );
}

/**
 * Reads one Payment Attempt outcome from an untrusted request body.
 *
 * The shape is checked, never the truth of it: a well-formed completed result
 * is still only a claim until the server verifies its signature and reads
 * Razorpay's own state.
 */
function parseLaunchResult(value: unknown): CheckoutLaunchResult | null {
  if (typeof value !== "object" || value === null) return null;
  const result = value as Record<string, unknown>;
  if (result.outcome === "DISMISSED") return { outcome: "DISMISSED" };
  if (result.outcome === "FAILED") {
    return {
      outcome: "FAILED",
      description:
        typeof result.description === "string"
          ? result.description.slice(0, 200)
          : "Razorpay could not complete this test payment.",
    };
  }
  if (
    result.outcome === "COMPLETED" &&
    typeof result.paymentId === "string" &&
    typeof result.providerOrderId === "string" &&
    typeof result.signature === "string"
  ) {
    return {
      outcome: "COMPLETED",
      paymentId: result.paymentId,
      providerOrderId: result.providerOrderId,
      signature: result.signature,
    };
  }
  return null;
}
