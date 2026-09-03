import { pgEnum } from "drizzle-orm/pg-core";

export const productRelationTypeEnum = pgEnum("product_relation_type", [
  "CROSS_SELL",
  "UPSELL",
  "BUNDLE",
  "ACCESSORY",
  "ALTERNATIVE",
]);

export const cartStatusEnum = pgEnum("cart_status", [
  "ACTIVE",
  "CHECKOUT_PENDING",
  "CONVERTED",
  "ABANDONED",
]);

export const actorTypeEnum = pgEnum("actor_type", [
  "AGENT",
  "SYSTEM",
  "RAZORPAY",
  "CUSTOMER",
]);

export const messageRoleEnum = pgEnum("message_role", [
  "CUSTOMER",
  "ASSISTANT",
  "TOOL",
  "SYSTEM",
]);

export const agentActionStatusEnum = pgEnum("agent_action_status", [
  "PROPOSED",
  "EXECUTED",
  "FAILED",
  "BLOCKED",
]);

/**
 * A Checkout Proposal's life. It is prepared ACTIVE, and leaves that state
 * exactly once: consumed by an Approval, invalidated by a Cart Mutation, or
 * expired by the clock.
 */
export const checkoutProposalStatusEnum = pgEnum("checkout_proposal_status", [
  "ACTIVE",
  "CONSUMED",
  "INVALIDATED",
  "EXPIRED",
]);

/**
 * An internal Order's progress toward a captured payment. PAYMENT_FAILED is
 * reached only after every permitted Checkout launch is spent without a
 * capture, never from one dismissal or one declined test card.
 */
export const orderStatusEnum = pgEnum("order_status", [
  "PAYMENT_SETUP",
  "PAYMENT_PENDING",
  "PAID",
  "PAYMENT_FAILED",
]);

/**
 * One Provider Write's durable, retry-safe logical execution.
 *
 * OUTCOME_UNKNOWN is not a failure: the request reached Razorpay and its
 * response was lost, so provider state must be reconciled before the operation
 * is treated as applied (SUCCEEDED) or absent (CONFIRMED_ABSENT).
 */
export const providerOperationStatusEnum = pgEnum(
  "provider_operation_status",
  [
    "READY",
    "DISPATCHED",
    "SUCCEEDED",
    "OUTCOME_UNKNOWN",
    "CONFIRMED_ABSENT",
    "FAILED",
  ],
);

/** One explicit presentation of managed Razorpay Checkout to a Customer. */
export const paymentAttemptStatusEnum = pgEnum("payment_attempt_status", [
  "OPENED",
  "DISMISSED",
  "FAILED",
  "CAPTURED",
]);

/** Which Razorpay Payment Account a record belongs to. Live is refused. */
export const paymentEnvironmentEnum = pgEnum("payment_environment", ["TEST"]);
