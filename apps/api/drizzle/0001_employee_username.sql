ALTER TABLE "employees" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_username_unique" UNIQUE("username");