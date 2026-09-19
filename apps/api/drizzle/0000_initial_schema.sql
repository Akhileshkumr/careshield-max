CREATE TYPE "public"."eligibility_decision" AS ENUM('ACCEPTED', 'DECLINED', 'REFERRED');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('QUOTE_GENERATED', 'MEDICAL_DECLARED', 'PREMIUM_PAID', 'POLICY_ISSUED', 'EXPIRED', 'DECLINED');--> statement-breakpoint
CREATE SEQUENCE "public"."policy_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "medical_declarations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"disclosures" jsonb NOT NULL,
	"decision" "eligibility_decision" NOT NULL,
	"reasons" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"declared_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medical_declarations_quote_id_unique" UNIQUE("quote_id")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"quote_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"provider_reference" text,
	"failure_code" text,
	"response_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "payments_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "payments_amount_non_negative_chk" CHECK ("payments"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"policy_number" text NOT NULL,
	"premium_paid" numeric(10, 2) NOT NULL,
	"payment_reference" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date NOT NULL,
	CONSTRAINT "policies_quote_id_unique" UNIQUE("quote_id"),
	CONSTRAINT "policies_policy_number_unique" UNIQUE("policy_number"),
	CONSTRAINT "policies_cover_period_chk" CHECK ("policies"."effective_to" > "policies"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicant_name" text NOT NULL,
	"age" integer NOT NULL,
	"has_pre_existing_conditions" boolean NOT NULL,
	"base_premium" numeric(10, 2) NOT NULL,
	"age_loading" numeric(10, 2) NOT NULL,
	"condition_loading" numeric(10, 2) NOT NULL,
	"total_premium" numeric(10, 2) NOT NULL,
	"status" "quote_status" DEFAULT 'QUOTE_GENERATED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "quotes_age_range_chk" CHECK ("quotes"."age" BETWEEN 18 AND 100),
	CONSTRAINT "quotes_premiums_non_negative_chk" CHECK ("quotes"."base_premium" >= 0 AND "quotes"."age_loading" >= 0 AND "quotes"."condition_loading" >= 0 AND "quotes"."total_premium" >= 0),
	CONSTRAINT "quotes_total_is_sum_chk" CHECK ("quotes"."total_premium" = "quotes"."base_premium" + "quotes"."age_loading" + "quotes"."condition_loading"),
	CONSTRAINT "quotes_expiry_after_creation_chk" CHECK ("quotes"."expires_at" > "quotes"."created_at")
);
--> statement-breakpoint
ALTER TABLE "medical_declarations" ADD CONSTRAINT "medical_declarations_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "medical_declarations_decision_idx" ON "medical_declarations" USING btree ("decision");--> statement-breakpoint
CREATE INDEX "payments_quote_id_idx" ON "payments" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "payments_status_created_at_idx" ON "payments" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "quotes_status_expires_at_idx" ON "quotes" USING btree ("status","expires_at");