import type { JsonObject } from "@/db/schema/types";
import {
  isCheckoutReadiness,
  type CheckoutReadiness,
} from "@/modules/cart/checkout-readiness";
import {
  isCheckoutProposal,
  type CheckoutPreparation,
} from "@/modules/checkout/checkout-proposal";

/**
 * The fixed text of the Review for checkout entry.
 *
 * The Customer never types it, so it stays constant for every readiness result
 * and can never be mistaken for Customer-authored text.
 */
export const CHECKOUT_READINESS_ACTION_MESSAGE = "Review my Cart for checkout";

/**
 * The fixed text of the Check out entry.
 *
 * Like the readiness entry it is generated, never typed, so no Customer
 * wording can be mistaken for the authorization that only the Approval control
 * carries.
 */
export const CHECKOUT_ACTION_MESSAGE = "Check out my Cart";

/**
 * A Conversation entry produced by an explicit Customer UI action.
 *
 * It sits on the Customer's side of the Transcript because the Customer
 * initiated it, and it always carries its generated provenance and the
 * deterministic result the Storefront produced. A Review for checkout entry
 * carries a readiness result; a Check out entry carries the checkout
 * preparation, which is itself a readiness result when the Cart cannot proceed.
 */
export type CheckoutReadinessActionEntry = {
  id: string;
  action: "CHECKOUT_READINESS";
  message: string;
  provenance: "GENERATED";
  readiness: CheckoutReadiness;
};

export type CheckoutActionEntry = {
  id: string;
  action: "CHECKOUT";
  message: string;
  provenance: "GENERATED";
  preparation: CheckoutPreparation;
};

export type CustomerActionEntry =
  | CheckoutReadinessActionEntry
  | CheckoutActionEntry;

type PersistedMessage = {
  id: string;
  content: string;
  metadata: JsonObject;
};

/**
 * Builds the durable Transcript record for one Review for checkout action.
 *
 * The readiness card is stored beside the fixed text, so a later reload shows
 * the exact Cart version, Items, Cart Prices, and Cart Subtotal that were
 * evaluated rather than a re-evaluation of a since-changed Cart.
 *
 * @param readiness - Deterministic readiness result to retain.
 * @returns The message content and metadata to persist.
 */
export function checkoutReadinessActionEntry(readiness: CheckoutReadiness): {
  content: string;
  metadata: JsonObject;
} {
  return {
    content: CHECKOUT_READINESS_ACTION_MESSAGE,
    metadata: {
      customerAction: {
        type: "CHECKOUT_READINESS",
        provenance: "GENERATED",
        readiness,
      },
    },
  };
}

/**
 * Builds the durable Transcript record for one Check out action.
 *
 * The prepared proposal is stored whole, so a reload shows the exact lines,
 * amounts, Cart version, and expiry the Customer was asked to approve rather
 * than a fresh preparation of a since-changed Cart.
 *
 * @param preparation - Deterministic checkout preparation to retain.
 * @returns The message content and metadata to persist.
 */
export function checkoutActionEntry(preparation: CheckoutPreparation): {
  content: string;
  metadata: JsonObject;
} {
  return {
    content: CHECKOUT_ACTION_MESSAGE,
    metadata: {
      customerAction: {
        type: "CHECKOUT",
        provenance: "GENERATED",
        preparation,
      },
    },
  };
}

/**
 * Reads a persisted message back as a Customer Action Entry.
 *
 * An ordinary Customer message, and an action whose recorded result is missing
 * or unrecognized, return `null` so the Transcript never presents typed text as
 * generated or an entry without the result it recorded.
 *
 * @param message - Persisted Customer-side message row.
 * @returns The reloaded entry, or `null` when the row is not one.
 */
export function parseCustomerActionEntry(
  message: PersistedMessage,
): CustomerActionEntry | null {
  const action = message.metadata.customerAction;
  if (typeof action !== "object" || action === null) return null;
  const { type, readiness, preparation } = action as {
    type?: unknown;
    readiness?: unknown;
    preparation?: unknown;
  };

  if (type === "CHECKOUT_READINESS" && isCheckoutReadiness(readiness)) {
    return {
      id: message.id,
      action: "CHECKOUT_READINESS",
      message: CHECKOUT_READINESS_ACTION_MESSAGE,
      provenance: "GENERATED",
      readiness,
    };
  }
  if (type === "CHECKOUT" && isCheckoutPreparation(preparation)) {
    return {
      id: message.id,
      action: "CHECKOUT",
      message: CHECKOUT_ACTION_MESSAGE,
      provenance: "GENERATED",
      preparation,
    };
  }
  return null;
}

/**
 * Whether a persisted value has the shape of a checkout preparation.
 *
 * Each branch is recognized by the result it carries, so a stored entry never
 * renders an Approval control for a proposal that failed to reload.
 */
function isCheckoutPreparation(value: unknown): value is CheckoutPreparation {
  if (typeof value !== "object" || value === null) return false;
  const preparation = value as { status?: unknown } & Record<string, unknown>;
  if (preparation.status === "PREPARED") {
    return isCheckoutProposal(preparation.proposal);
  }
  if (preparation.status === "NOT_READY") {
    return isCheckoutReadiness(preparation.readiness);
  }
  return (
    preparation.status === "UNAVAILABLE" &&
    typeof preparation.explanation === "string"
  );
}

/**
 * Whether this entry is the Review for checkout kind, which carries a readiness
 * result rather than a checkout preparation.
 */
export function isCheckoutReadinessActionEntry(
  entry: unknown,
): entry is CheckoutReadinessActionEntry {
  return (
    isCustomerActionEntry(entry) && entry.action === "CHECKOUT_READINESS"
  );
}

/**
 * Whether a Transcript entry was generated by a Customer UI action rather than
 * produced by a Conversation Turn.
 */
export function isCustomerActionEntry(
  entry: unknown,
): entry is CustomerActionEntry {
  if (typeof entry !== "object" || entry === null) return false;
  const { provenance, action } = entry as {
    provenance?: unknown;
    action?: unknown;
  };
  return (
    provenance === "GENERATED" &&
    (action === "CHECKOUT_READINESS" || action === "CHECKOUT")
  );
}
