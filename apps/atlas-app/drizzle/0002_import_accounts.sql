ALTER TYPE "number_status" ADD VALUE IF NOT EXISTS 'unassigned';--> statement-breakpoint
ALTER TABLE "numbers" ADD COLUMN IF NOT EXISTS "business_name" text;--> statement-breakpoint
ALTER TABLE "numbers" ADD COLUMN IF NOT EXISTS "access_token_encrypted" text;--> statement-breakpoint
ALTER TABLE "numbers" ADD CONSTRAINT "numbers_phone_number_id_unique" UNIQUE("phone_number_id");
