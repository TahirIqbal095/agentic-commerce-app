ALTER TABLE "conversations" RENAME COLUMN "constraints" TO "context";--> statement-breakpoint
UPDATE "conversations"
SET "context" = '{"schemaVersion":1,"revision":0,"productConstraints":{"productTypes":[],"useCases":[],"features":[],"category":null,"minPriceMinor":null,"maxPriceMinor":null,"size":null,"inStockOnly":true,"attributes":{}}}'::jsonb;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "context" SET DEFAULT '{"schemaVersion":1,"revision":0,"productConstraints":{"productTypes":[],"useCases":[],"features":[],"category":null,"minPriceMinor":null,"maxPriceMinor":null,"size":null,"inStockOnly":true,"attributes":{}}}';
