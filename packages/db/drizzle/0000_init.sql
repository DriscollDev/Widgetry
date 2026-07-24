CREATE TABLE "boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"refresh_mode" text NOT NULL,
	"refresh_interval_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boards_refresh_mode_check" CHECK ("boards"."refresh_mode" in ('auto', 'manual')),
	CONSTRAINT "boards_refresh_interval_check" CHECK (("boards"."refresh_mode" = 'auto' and "boards"."refresh_interval_seconds" in (30, 60, 300, 900, 1800, 3600))
          or ("boards"."refresh_mode" = 'manual' and "boards"."refresh_interval_seconds" is null))
);
--> statement-breakpoint
CREATE TABLE "widgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"widget_type" text NOT NULL,
	"polling_mode" text NOT NULL,
	"grid_col" integer NOT NULL,
	"grid_row" integer NOT NULL,
	"grid_width" integer NOT NULL,
	"grid_height" integer NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"refresh_interval_seconds" integer,
	"retention_hours" integer DEFAULT 168 NOT NULL,
	"last_polled_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "widgets_widget_type_check" CHECK ("widgets"."widget_type" in ('uptime', 'weather', 'stock', 'currency', 'datetime', 'clock', 'custom_json')),
	CONSTRAINT "widgets_polling_mode_check" CHECK ("widgets"."polling_mode" in ('client', 'server')),
	CONSTRAINT "widgets_grid_col_check" CHECK ("widgets"."grid_col" between 0 and 11),
	CONSTRAINT "widgets_grid_row_check" CHECK ("widgets"."grid_row" >= 0),
	CONSTRAINT "widgets_grid_width_check" CHECK ("widgets"."grid_width" between 1 and 6),
	CONSTRAINT "widgets_grid_height_check" CHECK ("widgets"."grid_height" between 1 and 6),
	CONSTRAINT "widgets_refresh_interval_check" CHECK ("widgets"."refresh_interval_seconds" is null or "widgets"."refresh_interval_seconds" >= 3600),
	CONSTRAINT "widgets_retention_hours_check" CHECK ("widgets"."retention_hours" between 12 and 720)
);
--> statement-breakpoint
CREATE TABLE "widget_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"widget_id" uuid NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"value" jsonb,
	"error" jsonb
);
--> statement-breakpoint
CREATE TABLE "api_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"widget_id" uuid NOT NULL,
	"ciphertext" "bytea" NOT NULL,
	"ciphertext_iv" "bytea" NOT NULL,
	"ciphertext_auth_tag" "bytea" NOT NULL,
	"encrypted_dek" "bytea" NOT NULL,
	"dek_iv" "bytea" NOT NULL,
	"dek_auth_tag" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_credentials_widget_id_unique" UNIQUE("widget_id")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widgets" ADD CONSTRAINT "widgets_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_snapshots" ADD CONSTRAINT "widget_snapshots_widget_id_widgets_id_fk" FOREIGN KEY ("widget_id") REFERENCES "public"."widgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_credentials" ADD CONSTRAINT "api_credentials_widget_id_widgets_id_fk" FOREIGN KEY ("widget_id") REFERENCES "public"."widgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "boards_user_id_created_at_idx" ON "boards" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "widgets_board_id_idx" ON "widgets" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "widgets_scheduler_idx" ON "widgets" USING btree ("polling_mode","last_polled_at") WHERE "widgets"."polling_mode" = 'server';--> statement-breakpoint
CREATE INDEX "widget_snapshots_widget_id_captured_at_idx" ON "widget_snapshots" USING btree ("widget_id","captured_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");