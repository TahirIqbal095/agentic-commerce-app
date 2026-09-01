TRUNCATE TABLE "audit_events", "messages";--> statement-breakpoint
ALTER TABLE "audit_events" ALTER COLUMN "actor_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "actor_type";--> statement-breakpoint
CREATE TYPE "actor_type" AS ENUM('AGENT', 'SYSTEM', 'RAZORPAY');--> statement-breakpoint
ALTER TABLE "audit_events" ALTER COLUMN "actor_type" SET DATA TYPE "actor_type" USING "actor_type"::"actor_type";--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "message_role";--> statement-breakpoint
CREATE TYPE "message_role" AS ENUM('CUSTOMER', 'ASSISTANT', 'TOOL', 'SYSTEM');--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "role" SET DATA TYPE "message_role" USING "role"::"message_role";
