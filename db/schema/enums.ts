import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "CUSTOMER",
  "MERCHANT_ADMIN",
]);

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

export const checkoutProposalStatusEnum = pgEnum("checkout_proposal_status", [
  "PREPARED",
  "APPROVAL_PENDING",
  "APPROVED",
  "CONSUMED",
  "INVALIDATED",
  "EXPIRED",
]);

export const policyDecisionEnum = pgEnum("policy_decision", [
  "ALLOW",
  "REQUIRES_APPROVAL",
  "BLOCK",
]);

export const approvalStatusEnum = pgEnum("approval_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "CONSUMED",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "PENDING",
  "PAYMENT_PENDING",
  "PAID",
  "PAYMENT_FAILED",
  "CANCELLED",
  "FULFILLED",
]);

export const paymentProviderEnum = pgEnum("payment_provider", ["RAZORPAY"]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "CREATED",
  "PENDING",
  "AUTHORIZED",
  "CAPTURED",
  "FAILED",
  "REFUNDED",
]);

export const actorTypeEnum = pgEnum("actor_type", [
  "USER",
  "AGENT",
  "SYSTEM",
  "MERCHANT",
  "RAZORPAY",
]);

export const messageRoleEnum = pgEnum("message_role", [
  "USER",
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
