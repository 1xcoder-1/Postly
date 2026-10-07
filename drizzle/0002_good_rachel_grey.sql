ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL DEFAULT 'legacy';--> statement-breakpoint
ALTER TABLE "rejection_feedback" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL DEFAULT 'legacy';--> statement-breakpoint
-- Pre-existing rows had no owner; stamp them 'legacy' so no account claims
-- them by accident. The column default is dropped right after — new rows must
-- carry the verified session's user id explicitly.
ALTER TABLE "posts" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "rejection_feedback" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_user_id_idx" ON "posts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rejection_user_id_idx" ON "rejection_feedback" USING btree ("user_id");
