CREATE TYPE "actor_type" AS ENUM('USER', 'AGENT', 'SYSTEM', 'BRAND_ADMIN', 'RAZORPAY');--> statement-breakpoint
CREATE TYPE "agent_action_status" AS ENUM('PROPOSED', 'EXECUTED', 'FAILED', 'BLOCKED');--> statement-breakpoint
CREATE TYPE "approval_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CONSUMED');--> statement-breakpoint
CREATE TYPE "cart_status" AS ENUM('ACTIVE', 'CHECKOUT_PENDING', 'CONVERTED', 'ABANDONED');--> statement-breakpoint
CREATE TYPE "checkout_proposal_status" AS ENUM('PREPARED', 'APPROVAL_PENDING', 'APPROVED', 'CONSUMED', 'INVALIDATED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "message_role" AS ENUM('USER', 'ASSISTANT', 'TOOL', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "order_status" AS ENUM('PENDING', 'PAYMENT_PENDING', 'PAID', 'PAYMENT_FAILED', 'CANCELLED', 'FULFILLED');--> statement-breakpoint
CREATE TYPE "payment_provider" AS ENUM('RAZORPAY');--> statement-breakpoint
CREATE TYPE "payment_status" AS ENUM('CREATED', 'PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "policy_decision" AS ENUM('ALLOW', 'REQUIRES_APPROVAL', 'BLOCK');--> statement-breakpoint
CREATE TYPE "product_relation_type" AS ENUM('CROSS_SELL', 'UPSELL', 'BUNDLE', 'ACCESSORY', 'ALTERNATIVE');--> statement-breakpoint
CREATE TABLE "agent_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"action_type" varchar(120) NOT NULL,
	"tool_name" varchar(120) NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"reason" text NOT NULL,
	"status" "agent_action_status" DEFAULT 'PROPOSED'::"agent_action_status" NOT NULL,
	"money_impact_minor" bigint,
	"currency" varchar(3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_actions_money_impact_nonnegative" CHECK ("money_impact_minor" is null or "money_impact_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"active_cart_id" uuid,
	"constraints" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"conversation_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"cart_id" uuid NOT NULL,
	"source_product_id" uuid,
	"recommended_product_id" uuid NOT NULL,
	"recommendation_type" "product_relation_type" NOT NULL,
	"reason" text NOT NULL,
	"cart_value_before_minor" bigint NOT NULL,
	"projected_cart_value_minor" bigint NOT NULL,
	"incremental_revenue_minor" bigint,
	"shown_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	CONSTRAINT "recommendation_events_values_nonnegative" CHECK ("cart_value_before_minor" >= 0 and "projected_cart_value_minor" >= 0 and ("incremental_revenue_minor" is null or "incremental_revenue_minor" >= 0)),
	CONSTRAINT "recommendation_events_one_resolution" CHECK (not ("accepted_at" is not null and "rejected_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid,
	"session_id" varchar(200),
	"entity_type" varchar(120) NOT NULL,
	"entity_id" varchar(240) NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"event_type" varchar(160) NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"cart_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_snapshot_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_quantity_range" CHECK ("quantity" between 1 and 10),
	CONSTRAINT "cart_items_snapshot_nonnegative" CHECK ("unit_price_snapshot_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"status" "cart_status" DEFAULT 'ACTIVE'::"cart_status" NOT NULL,
	"currency" varchar(3) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carts_version_positive" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE TABLE "product_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"product_id" uuid NOT NULL,
	"related_product_id" uuid NOT NULL,
	"relation_type" "product_relation_type" NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_relations_not_self" CHECK ("product_id" <> "related_product_id"),
	CONSTRAINT "product_relations_score_range" CHECK ("score" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" varchar(200) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"description" text NOT NULL,
	"category" varchar(120) NOT NULL,
	"price_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"attributes" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_price_nonnegative" CHECK ("price_minor" >= 0),
	CONSTRAINT "products_stock_nonnegative" CHECK ("stock" >= 0)
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"proposal_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"action_type" varchar(120) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"reason" text NOT NULL,
	"status" "approval_status" DEFAULT 'PENDING'::"approval_status" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "approvals_amount_nonnegative" CHECK ("amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "checkout_proposal_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"proposal_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"name_snapshot" varchar(240) NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"line_total_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkout_proposal_items_quantity_positive" CHECK ("quantity" > 0),
	CONSTRAINT "checkout_proposal_items_amounts_nonnegative" CHECK ("unit_price_minor" >= 0 and "line_total_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "checkout_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"cart_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"cart_version" integer NOT NULL,
	"status" "checkout_proposal_status" DEFAULT 'PREPARED'::"checkout_proposal_status" NOT NULL,
	"policy_decision" "policy_decision" NOT NULL,
	"policy_reasons" jsonb DEFAULT '[]' NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"discount_minor" bigint NOT NULL,
	"shipping_minor" bigint NOT NULL,
	"tax_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"stock_warnings" jsonb DEFAULT '[]' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkout_proposals_cart_version_positive" CHECK ("cart_version" > 0),
	CONSTRAINT "checkout_proposals_amounts_nonnegative" CHECK ("subtotal_minor" >= 0 and "discount_minor" >= 0 and "shipping_minor" >= 0 and "tax_minor" >= 0 and "total_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"key" varchar(120) NOT NULL,
	"value" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"proposal_id" uuid NOT NULL,
	"policy_id" uuid,
	"decision" "policy_decision" NOT NULL,
	"reason" text NOT NULL,
	"input" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_admins" (
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"singleton_key" varchar(16) DEFAULT 'BRAND' NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(160) NOT NULL,
	"description" text NOT NULL,
	"logo_url" varchar(500),
	"currency" varchar(3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_singleton_key" CHECK ("singleton_key" = 'BRAND')
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"email" varchar(320) NOT NULL,
	"name" varchar(160) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"name_snapshot" varchar(240) NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"line_total_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" > 0),
	CONSTRAINT "order_items_amounts_nonnegative" CHECK ("unit_price_minor" >= 0 and "line_total_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"cart_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"approval_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'PENDING'::"order_status" NOT NULL,
	"currency" varchar(3) NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"discount_minor" bigint NOT NULL,
	"shipping_minor" bigint NOT NULL,
	"tax_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_amounts_nonnegative" CHECK ("subtotal_minor" >= 0 and "discount_minor" >= 0 and "shipping_minor" >= 0 and "tax_minor" >= 0 and "total_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"order_id" uuid NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"idempotency_key" varchar(200) NOT NULL,
	"provider_order_id" varchar(200),
	"provider_payment_id" varchar(200),
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" "payment_status" DEFAULT 'CREATED'::"payment_status" NOT NULL,
	"failure_code" varchar(160),
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_attempts_amount_nonnegative" CHECK ("amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"provider" "payment_provider" NOT NULL,
	"provider_event_id" varchar(240) NOT NULL,
	"event_type" varchar(160) NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agent_actions_conversation_idx" ON "agent_actions" ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "conversations_customer_idx" ON "conversations" ("user_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "recommendation_events_cart_idx" ON "recommendation_events" ("cart_id","shown_at");--> statement-breakpoint
CREATE INDEX "audit_events_created_idx" ON "audit_events" ("created_at");--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cart_items_product_selection_unique" ON "cart_items" ("cart_id","product_id");--> statement-breakpoint
CREATE INDEX "cart_items_cart_idx" ON "cart_items" ("cart_id");--> statement-breakpoint
CREATE UNIQUE INDEX "carts_one_active_per_customer" ON "carts" ("user_id") WHERE "status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "carts_user_idx" ON "carts" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_relations_unique" ON "product_relations" ("product_id","related_product_id","relation_type");--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_unique" ON "products" ("slug");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "approvals_proposal_unique" ON "approvals" ("proposal_id");--> statement-breakpoint
CREATE INDEX "approvals_user_status_idx" ON "approvals" ("user_id","status");--> statement-breakpoint
CREATE INDEX "checkout_proposal_items_proposal_idx" ON "checkout_proposal_items" ("proposal_id");--> statement-breakpoint
CREATE INDEX "checkout_proposals_customer_idx" ON "checkout_proposals" ("user_id");--> statement-breakpoint
CREATE INDEX "checkout_proposals_cart_idx" ON "checkout_proposals" ("cart_id");--> statement-breakpoint
CREATE UNIQUE INDEX "policies_key_unique" ON "policies" ("key");--> statement-breakpoint
CREATE INDEX "policy_evaluations_proposal_idx" ON "policy_evaluations" ("proposal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_admins_user_unique" ON "brand_admins" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_singleton_unique" ON "brands" ("singleton_key");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_slug_unique" ON "brands" ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" ("email");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_proposal_unique" ON "orders" ("proposal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_approval_unique" ON "orders" ("approval_id");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_idempotency_unique" ON "payment_attempts" ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_provider_order_unique" ON "payment_attempts" ("provider","provider_order_id") WHERE "provider_order_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_provider_payment_unique" ON "payment_attempts" ("provider","provider_payment_id") WHERE "provider_payment_id" is not null;--> statement-breakpoint
CREATE INDEX "payment_attempts_order_idx" ON "payment_attempts" ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_event_unique" ON "webhook_events" ("provider","provider_event_id");--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_conversation_id_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_active_cart_id_carts_id_fkey" FOREIGN KEY ("active_cart_id") REFERENCES "carts"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "recommendation_events" ADD CONSTRAINT "recommendation_events_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "recommendation_events" ADD CONSTRAINT "recommendation_events_cart_id_carts_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "recommendation_events" ADD CONSTRAINT "recommendation_events_source_product_id_products_id_fkey" FOREIGN KEY ("source_product_id") REFERENCES "products"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "recommendation_events" ADD CONSTRAINT "recommendation_events_recommended_product_id_products_id_fkey" FOREIGN KEY ("recommended_product_id") REFERENCES "products"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "product_relations" ADD CONSTRAINT "product_relations_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_relations" ADD CONSTRAINT "product_relations_related_product_id_products_id_fkey" FOREIGN KEY ("related_product_id") REFERENCES "products"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_proposal_id_checkout_proposals_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "checkout_proposals"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "checkout_proposal_items" ADD CONSTRAINT "checkout_proposal_items_proposal_id_checkout_proposals_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "checkout_proposals"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "checkout_proposal_items" ADD CONSTRAINT "checkout_proposal_items_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "checkout_proposals" ADD CONSTRAINT "checkout_proposals_cart_id_carts_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "checkout_proposals" ADD CONSTRAINT "checkout_proposals_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "policy_evaluations" ADD CONSTRAINT "policy_evaluations_proposal_id_checkout_proposals_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "checkout_proposals"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "policy_evaluations" ADD CONSTRAINT "policy_evaluations_policy_id_policies_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "brand_admins" ADD CONSTRAINT "brand_admins_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cart_id_carts_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_proposal_id_checkout_proposals_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "checkout_proposals"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_approval_id_approvals_id_fkey" FOREIGN KEY ("approval_id") REFERENCES "approvals"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT;