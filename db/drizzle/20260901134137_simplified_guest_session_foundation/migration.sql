CREATE TABLE "guest_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approvals" DROP CONSTRAINT "approvals_proposal_id_checkout_proposals_id_fkey";--> statement-breakpoint
ALTER TABLE "checkout_proposal_items" DROP CONSTRAINT "checkout_proposal_items_proposal_id_checkout_proposals_id_fkey";--> statement-breakpoint
ALTER TABLE "policy_evaluations" DROP CONSTRAINT "policy_evaluations_proposal_id_checkout_proposals_id_fkey";--> statement-breakpoint
ALTER TABLE "policy_evaluations" DROP CONSTRAINT "policy_evaluations_policy_id_policies_id_fkey";--> statement-breakpoint
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_order_id_orders_id_fkey";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_proposal_id_checkout_proposals_id_fkey";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_approval_id_approvals_id_fkey";--> statement-breakpoint
ALTER TABLE "payment_attempts" DROP CONSTRAINT "payment_attempts_order_id_orders_id_fkey";--> statement-breakpoint
DROP TABLE "approvals";--> statement-breakpoint
DROP TABLE "checkout_proposal_items";--> statement-breakpoint
DROP TABLE "checkout_proposals";--> statement-breakpoint
DROP TABLE "policies";--> statement-breakpoint
DROP TABLE "policy_evaluations";--> statement-breakpoint
DROP TABLE "order_items";--> statement-breakpoint
DROP TABLE "orders";--> statement-breakpoint
DROP TABLE "payment_attempts";--> statement-breakpoint
DROP TABLE "webhook_events";--> statement-breakpoint
CREATE UNIQUE INDEX "guest_sessions_token_hash_unique" ON "guest_sessions" ("token_hash");--> statement-breakpoint
CREATE INDEX "guest_sessions_expiry_idx" ON "guest_sessions" ("expires_at");--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_currency_inr" CHECK ("currency" = 'INR');--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_currency_inr" CHECK ("currency" = 'INR');--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_currency_inr" CHECK ("currency" = 'INR');--> statement-breakpoint
CREATE FUNCTION reject_product_price_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF OLD.price_minor IS DISTINCT FROM NEW.price_minor THEN
		RAISE EXCEPTION 'Product prices are immutable';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "products_price_immutable"
BEFORE UPDATE OF "price_minor" ON "products"
FOR EACH ROW
EXECUTE FUNCTION reject_product_price_change();--> statement-breakpoint
CREATE FUNCTION reject_cart_price_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF OLD.unit_price_snapshot_minor IS DISTINCT FROM NEW.unit_price_snapshot_minor THEN
		RAISE EXCEPTION 'Cart Prices are immutable';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "cart_items_price_immutable"
BEFORE UPDATE OF "unit_price_snapshot_minor" ON "cart_items"
FOR EACH ROW
EXECUTE FUNCTION reject_cart_price_change();--> statement-breakpoint
DROP TYPE "approval_status";--> statement-breakpoint
DROP TYPE "checkout_proposal_status";--> statement-breakpoint
DROP TYPE "order_status";--> statement-breakpoint
DROP TYPE "payment_provider";--> statement-breakpoint
DROP TYPE "payment_status";--> statement-breakpoint
DROP TYPE "policy_decision";
