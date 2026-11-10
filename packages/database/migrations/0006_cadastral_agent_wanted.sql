ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "plot_number" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "street_number" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "block_name" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "properties_plot_cadastral_idx" ON "properties" ("society_id", "block_name", "plot_number");--> statement-breakpoint

ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "association_name" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "association_number" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "fbr_ntn" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "office_address" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "office_phone" text;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "property_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"city_id" uuid REFERENCES "cities"("id"),
	"city_name" text NOT NULL,
	"location_name" text NOT NULL,
	"property_type" "property_type" NOT NULL,
	"purpose" "purpose" DEFAULT 'sale' NOT NULL,
	"min_budget" bigint,
	"max_budget" bigint NOT NULL,
	"area_value" numeric(12, 2),
	"area_unit" "area_unit",
	"description" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"is_direct_buyer" boolean DEFAULT true NOT NULL,
	"pitches_count" integer DEFAULT 0 NOT NULL,
	"is_seed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "req_city_idx" ON "property_requirements" ("city_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "req_type_idx" ON "property_requirements" ("property_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "req_status_idx" ON "property_requirements" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "req_created_idx" ON "property_requirements" ("created_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "requirement_pitches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requirement_id" uuid NOT NULL REFERENCES "property_requirements"("id") ON DELETE CASCADE,
	"agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"listing_id" uuid REFERENCES "property_listings"("id") ON DELETE SET NULL,
	"pitch_text" text NOT NULL,
	"offered_price" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pitch_req_idx" ON "requirement_pitches" ("requirement_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pitch_agent_idx" ON "requirement_pitches" ("agent_id");
