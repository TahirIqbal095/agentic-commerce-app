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
