ALTER TABLE "cart_items" DROP CONSTRAINT "cart_items_variant_id_product_variants_id_fkey";--> statement-breakpoint
ALTER TABLE "checkout_proposal_items" DROP CONSTRAINT "checkout_proposal_items_variant_id_product_variants_id_fkey";--> statement-breakpoint
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_variant_id_product_variants_id_fkey";--> statement-breakpoint
DROP TABLE "product_variants";--> statement-breakpoint
ALTER TABLE "checkout_proposals" DROP CONSTRAINT "checkout_proposals_version_positive";--> statement-breakpoint
DROP INDEX "cart_items_unvarianted_selection_unique";--> statement-breakpoint
DROP INDEX "cart_items_variant_selection_unique";--> statement-breakpoint
ALTER TABLE "cart_items" DROP COLUMN "variant_id";--> statement-breakpoint
ALTER TABLE "checkout_proposal_items" DROP COLUMN "variant_id";--> statement-breakpoint
ALTER TABLE "checkout_proposals" DROP COLUMN "version";--> statement-breakpoint
ALTER TABLE "checkout_proposals" DROP COLUMN "price_changes";--> statement-breakpoint
ALTER TABLE "order_items" DROP COLUMN "variant_id";--> statement-breakpoint
CREATE UNIQUE INDEX "cart_items_product_selection_unique" ON "cart_items" ("cart_id","product_id");