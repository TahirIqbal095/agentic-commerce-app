CREATE TABLE "cart_mutations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"guest_session_id" uuid NOT NULL,
	"mutation_key" uuid NOT NULL,
	"command_type" text NOT NULL,
	"product_id" uuid NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_mutations_command_type_valid" CHECK ("command_type" in ('ADD_PRODUCT', 'INCREMENT_ITEM', 'DECREMENT_ITEM', 'REMOVE_ITEM'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cart_mutations_guest_key_unique" ON "cart_mutations" ("guest_session_id","mutation_key");--> statement-breakpoint
CREATE INDEX "cart_mutations_guest_session_idx" ON "cart_mutations" ("guest_session_id");--> statement-breakpoint
ALTER TABLE "cart_mutations" ADD CONSTRAINT "cart_mutations_guest_session_id_guest_sessions_id_fkey" FOREIGN KEY ("guest_session_id") REFERENCES "guest_sessions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cart_mutations" ADD CONSTRAINT "cart_mutations_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT;