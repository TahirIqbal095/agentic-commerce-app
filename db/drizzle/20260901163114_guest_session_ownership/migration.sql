TRUNCATE TABLE "audit_events", "agent_actions", "recommendation_events", "messages", "conversations", "cart_items", "carts", "guest_sessions";--> statement-breakpoint
ALTER TABLE "agent_actions" DROP CONSTRAINT "agent_actions_user_id_users_id_fkey";--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_user_id_users_id_fkey";--> statement-breakpoint
ALTER TABLE "recommendation_events" DROP CONSTRAINT "recommendation_events_user_id_users_id_fkey";--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_user_id_users_id_fkey";--> statement-breakpoint
ALTER TABLE "carts" DROP CONSTRAINT "carts_user_id_users_id_fkey";--> statement-breakpoint
ALTER TABLE "brand_admins" DROP CONSTRAINT "brand_admins_user_id_users_id_fkey";--> statement-breakpoint
DROP TABLE "brand_admins";--> statement-breakpoint
DROP TABLE "users";--> statement-breakpoint
DROP INDEX "conversations_customer_idx";--> statement-breakpoint
DROP INDEX "conversations_one_current_per_customer_unique";--> statement-breakpoint
DROP INDEX "carts_user_idx";--> statement-breakpoint
ALTER TABLE "agent_actions" ADD COLUMN "guest_session_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "guest_session_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "recommendation_events" ADD COLUMN "guest_session_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "guest_session_id" uuid;--> statement-breakpoint
ALTER TABLE "carts" ADD COLUMN "guest_session_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_actions" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "conversations" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "recommendation_events" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "recommendation_events" DROP COLUMN "reason";--> statement-breakpoint
ALTER TABLE "audit_events" DROP COLUMN "user_id";--> statement-breakpoint
DROP INDEX "carts_one_active_per_customer";--> statement-breakpoint
ALTER TABLE "carts" DROP COLUMN "user_id";--> statement-breakpoint
CREATE UNIQUE INDEX "carts_one_active_per_customer" ON "carts" ("guest_session_id") WHERE "status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "conversations_guest_session_idx" ON "conversations" ("guest_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_one_current_per_guest_session_unique" ON "conversations" ("guest_session_id") WHERE "closed_at" is null;--> statement-breakpoint
CREATE INDEX "carts_guest_session_idx" ON "carts" ("guest_session_id");--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_guest_session_id_guest_sessions_id_fkey" FOREIGN KEY ("guest_session_id") REFERENCES "guest_sessions"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_guest_session_id_guest_sessions_id_fkey" FOREIGN KEY ("guest_session_id") REFERENCES "guest_sessions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "recommendation_events" ADD CONSTRAINT "recommendation_events_guest_session_id_guest_sessions_id_fkey" FOREIGN KEY ("guest_session_id") REFERENCES "guest_sessions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_guest_session_id_guest_sessions_id_fkey" FOREIGN KEY ("guest_session_id") REFERENCES "guest_sessions"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_guest_session_id_guest_sessions_id_fkey" FOREIGN KEY ("guest_session_id") REFERENCES "guest_sessions"("id") ON DELETE CASCADE;
