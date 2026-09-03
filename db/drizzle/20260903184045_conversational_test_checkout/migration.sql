CREATE TYPE "checkout_proposal_status" AS ENUM('ACTIVE', 'CONSUMED', 'INVALIDATED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "order_status" AS ENUM('PAYMENT_SETUP', 'PAYMENT_PENDING', 'PAID', 'PAYMENT_FAILED');--> statement-breakpoint
CREATE TYPE "payment_attempt_status" AS ENUM('OPENED', 'DISMISSED', 'FAILED', 'CAPTURED');--> statement-breakpoint
CREATE TYPE "payment_environment" AS ENUM('TEST');--> statement-breakpoint
CREATE TYPE "provider_operation_status" AS ENUM('READY', 'DISPATCHED', 'SUCCEEDED', 'OUTCOME_UNKNOWN', 'CONFIRMED_ABSENT', 'FAILED');--> statement-breakpoint
ALTER TYPE "actor_type" ADD VALUE 'CUSTOMER';--> statement-breakpoint
CREATE TABLE "checkout_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"proposal_id" uuid NOT NULL,
	"guest_session_id" uuid NOT NULL,
	"approval_key" uuid NOT NULL,
	"approved_total_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkout_approvals_currency_inr" CHECK ("currency" = 'INR')
);
--> statement-breakpoint
CREATE TABLE "checkout_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"guest_session_id" uuid NOT NULL,
	"command_key" uuid NOT NULL,
	"cart_id" uuid NOT NULL,
	"cart_version" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"lines" jsonb NOT NULL,
	"items_subtotal_minor" bigint NOT NULL,
	"discount_minor" bigint NOT NULL,
	"shipping_minor" bigint NOT NULL,
	"tax_minor" bigint NOT NULL,
	"checkout_total_minor" bigint NOT NULL,
	"policy_result" varchar(40) NOT NULL,
	"policy_reason_code" varchar(120) NOT NULL,
	"policy_explanation" text NOT NULL,
	"status" "checkout_proposal_status" DEFAULT 'ACTIVE'::"checkout_proposal_status" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkout_proposals_currency_inr" CHECK ("currency" = 'INR'),
	CONSTRAINT "checkout_proposals_zero_adjustments" CHECK ("discount_minor" = 0 and "shipping_minor" = 0 and "tax_minor" = 0),
	CONSTRAINT "checkout_proposals_total_matches_subtotal" CHECK ("checkout_total_minor" = "items_subtotal_minor"),
	CONSTRAINT "checkout_proposals_total_within_bounds" CHECK ("checkout_total_minor" between 100 and 5000000)
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name" varchar(200) NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"line_total_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity_range" CHECK ("quantity" between 1 and 10),
	CONSTRAINT "order_items_line_total_calculates" CHECK ("line_total_minor" = "quantity" * "unit_price_minor")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"guest_session_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"approval_id" uuid NOT NULL,
	"cart_id" uuid NOT NULL,
	"cart_version" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"items_subtotal_minor" bigint NOT NULL,
	"discount_minor" bigint NOT NULL,
	"shipping_minor" bigint NOT NULL,
	"tax_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"status" "order_status" DEFAULT 'PAYMENT_SETUP'::"order_status" NOT NULL,
	"environment_mode" "payment_environment" DEFAULT 'TEST'::"payment_environment" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_currency_inr" CHECK ("currency" = 'INR'),
	CONSTRAINT "orders_total_matches_subtotal" CHECK ("total_minor" = "items_subtotal_minor")
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"order_id" uuid NOT NULL,
	"provider_order_id" varchar(120) NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" "payment_attempt_status" DEFAULT 'OPENED'::"payment_attempt_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "payment_attempts_number_bounded" CHECK ("attempt_number" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "provider_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"event_id" varchar(160) NOT NULL,
	"event_type" varchar(120) NOT NULL,
	"provider_order_id" varchar(120),
	"provider_payment_id" varchar(120),
	"provider_status" varchar(40),
	"amount_minor" bigint,
	"currency" varchar(3),
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "provider_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"order_id" uuid NOT NULL,
	"operation_type" varchar(60) DEFAULT 'CREATE_ORDER' NOT NULL,
	"status" "provider_operation_status" DEFAULT 'READY'::"provider_operation_status" NOT NULL,
	"transport_attempts" integer DEFAULT 0 NOT NULL,
	"reconciliation_reads" integer DEFAULT 0 NOT NULL,
	"last_reason_code" varchar(120),
	"blocked_reason" text,
	"environment_mode" "payment_environment" DEFAULT 'TEST'::"payment_environment" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_operations_reads_bounded" CHECK ("reconciliation_reads" between 0 and 3)
);
--> statement-breakpoint
CREATE TABLE "provider_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"order_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"provider_order_id" varchar(120) NOT NULL,
	"receipt" varchar(120) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"provider_status" varchar(40) NOT NULL,
	"notes" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_orders_currency_inr" CHECK ("currency" = 'INR')
);
--> statement-breakpoint
CREATE TABLE "provider_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"provider_payment_id" varchar(120) NOT NULL,
	"provider_order_id" varchar(120) NOT NULL,
	"payment_attempt_id" uuid,
	"provider_status" varchar(40) NOT NULL,
	"captured" boolean DEFAULT false NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "reason_code" varchar(120);--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "correlation_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "prior_state" varchar(60);--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "new_state" varchar(60);--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "amount_minor" bigint;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "currency" varchar(3);--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "environment_mode" varchar(20);--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "operation_key" varchar(200);--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "provider_reference" varchar(200);--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "customer_visible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "detail" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "occurred_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "audit_events_correlation_idx" ON "audit_events" ("correlation_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_approvals_proposal_unique" ON "checkout_approvals" ("proposal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_approvals_key_unique" ON "checkout_approvals" ("guest_session_id","approval_key");--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_proposals_command_key_unique" ON "checkout_proposals" ("guest_session_id","command_key");--> statement-breakpoint
CREATE INDEX "checkout_proposals_cart_idx" ON "checkout_proposals" ("cart_id","cart_version");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_product_unique" ON "order_items" ("order_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_proposal_unique" ON "orders" ("proposal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_approval_unique" ON "orders" ("approval_id");--> statement-breakpoint
CREATE INDEX "orders_guest_session_idx" ON "orders" ("guest_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_number_unique" ON "payment_attempts" ("order_id","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_notifications_event_unique" ON "provider_notifications" ("event_id");--> statement-breakpoint
CREATE INDEX "provider_notifications_pending_idx" ON "provider_notifications" ("provider_order_id") WHERE "applied_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_operations_one_per_order_unique" ON "provider_operations" ("order_id","operation_type");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_orders_one_per_order_unique" ON "provider_orders" ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_orders_provider_id_unique" ON "provider_orders" ("provider_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_orders_receipt_unique" ON "provider_orders" ("receipt");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_payments_provider_id_unique" ON "provider_payments" ("provider_payment_id");--> statement-breakpoint
CREATE INDEX "provider_payments_order_idx" ON "provider_payments" ("provider_order_id");--> statement-breakpoint
ALTER TABLE "checkout_approvals" ADD CONSTRAINT "checkout_approvals_proposal_id_checkout_proposals_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "checkout_proposals"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "checkout_approvals" ADD CONSTRAINT "checkout_approvals_guest_session_id_guest_sessions_id_fkey" FOREIGN KEY ("guest_session_id") REFERENCES "guest_sessions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "checkout_proposals" ADD CONSTRAINT "checkout_proposals_guest_session_id_guest_sessions_id_fkey" FOREIGN KEY ("guest_session_id") REFERENCES "guest_sessions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "provider_operations" ADD CONSTRAINT "provider_operations_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "provider_orders" ADD CONSTRAINT "provider_orders_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "provider_orders" ADD CONSTRAINT "provider_orders_operation_id_provider_operations_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "provider_operations"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "provider_payments" ADD CONSTRAINT "provider_payments_payment_attempt_id_payment_attempts_id_fkey" FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempts"("id") ON DELETE SET NULL;