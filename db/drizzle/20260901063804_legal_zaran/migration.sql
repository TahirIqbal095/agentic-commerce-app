CREATE TABLE "cart_item_removals" (
	"id" uuid PRIMARY KEY,
	"cart_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_snapshot_minor" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"restored_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_item_removals_quantity_range" CHECK ("quantity" between 1 and 10),
	CONSTRAINT "cart_item_removals_snapshot_nonnegative" CHECK ("unit_price_snapshot_minor" >= 0)
);
--> statement-breakpoint
CREATE INDEX "cart_item_removals_cart_idx" ON "cart_item_removals" ("cart_id");--> statement-breakpoint
ALTER TABLE "cart_item_removals" ADD CONSTRAINT "cart_item_removals_cart_id_carts_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cart_item_removals" ADD CONSTRAINT "cart_item_removals_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT;