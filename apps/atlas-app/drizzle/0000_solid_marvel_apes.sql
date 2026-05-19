CREATE TYPE "public"."number_status" AS ENUM('active', 'paused', 'disconnected', 'banned');--> statement-breakpoint
CREATE TYPE "public"."quality_rating" AS ENUM('GREEN', 'YELLOW', 'RED', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meta_apps" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"app_secret_encrypted" text NOT NULL,
	"config_id" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_number" text NOT NULL,
	"display_name" text,
	"business_id" text,
	"waba_id" text,
	"phone_number_id" text,
	"product_slug" text,
	"product_name" text,
	"meta_app_used" text,
	"internal_label" text,
	"status" "number_status" DEFAULT 'active' NOT NULL,
	"quality_rating" "quality_rating" DEFAULT 'UNKNOWN' NOT NULL,
	"messaging_tier" text,
	"evolution_instance_name" text,
	"chatwoot_inbox_id" integer,
	"typebot_id" text,
	"connected_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "numbers_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"typebot_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" DEFAULT 'admin' NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_log" ADD CONSTRAINT "event_log_number_id_numbers_id_fk" FOREIGN KEY ("number_id") REFERENCES "public"."numbers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
