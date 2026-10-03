CREATE TABLE "site_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"sort_order" integer NOT NULL,
	"status" "progress_status" DEFAULT 'not_started' NOT NULL,
	"remaining_days" double precision,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"note" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_items" ADD CONSTRAINT "site_items_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_items" ADD CONSTRAINT "site_items_updated_by_employees_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_notes" ADD CONSTRAINT "site_notes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_notes" ADD CONSTRAINT "site_notes_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_notes" ADD CONSTRAINT "site_notes_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_items_site_idx" ON "site_items" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "site_notes_site_idx" ON "site_notes" USING btree ("site_id","created_at");--> statement-breakpoint
-- Backfill: existing sites get the default work items (DEFAULT_SITE_ITEMS in packages/shared).
INSERT INTO "site_items" ("site_id", "name", "aliases", "sort_order")
SELECT s."id", d."name", d."aliases", d."sort_order"
FROM "sites" s
CROSS JOIN (VALUES
	('主线缆', ARRAY['主电缆', '进户线', 'mains', 'main cable', 'sub-main', 'submain']::text[], 0),
	('电表箱', ARRAY['表箱', 'meter box']::text[], 1),
	('配电箱', ARRAY['总闸箱', '配电板', 'switchboard', 'board']::text[], 2),
	('户外', ARRAY['室外', '外墙灯', 'outdoor', 'external', 'outside lights']::text[], 3)
) AS d("name", "aliases", "sort_order");
