ALTER TABLE "conversations" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "idempotency_key" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "context" SET DEFAULT '{"schemaVersion":2,"revision":0,"productConstraints":{"productTypes":[],"useCases":[],"features":[],"category":null,"minPriceMinor":null,"maxPriceMinor":null,"size":null,"inStockOnly":true,"attributes":{}},"latestRecommendationSet":[]}';--> statement-breakpoint
UPDATE "conversations"
SET "context" = jsonb_build_object(
  'schemaVersion', 2,
  'revision', COALESCE(("context"->>'revision')::integer, 0),
  'productConstraints', COALESCE("context"->'productConstraints', '{"productTypes":[],"useCases":[],"features":[],"category":null,"minPriceMinor":null,"maxPriceMinor":null,"size":null,"inStockOnly":true,"attributes":{}}'::jsonb),
  'latestRecommendationSet', '[]'::jsonb
);--> statement-breakpoint
WITH ranked AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "user_id" ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
  ) AS position
  FROM "conversations"
)
UPDATE "conversations"
SET "closed_at" = now()
FROM ranked
WHERE "conversations"."id" = ranked."id" AND ranked.position > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_one_current_per_customer_unique" ON "conversations" ("user_id") WHERE "closed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_conversation_idempotency_key_unique" ON "messages" ("conversation_id","idempotency_key");
