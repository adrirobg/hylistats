CREATE TABLE "match_fetch" (
	"match_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"match_id" text PRIMARY KEY NOT NULL,
	"queue_id" integer NOT NULL,
	"game_creation" bigint NOT NULL,
	"game_start_timestamp" bigint NOT NULL,
	"game_end_timestamp" bigint NOT NULL,
	"game_duration" integer NOT NULL,
	"game_version" text NOT NULL,
	"end_of_game_result" text,
	"raw_gz" "bytea",
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"match_id" text NOT NULL,
	"puuid" text NOT NULL,
	"participant_id" integer NOT NULL,
	"riot_id_game_name" text NOT NULL,
	"riot_id_tagline" text NOT NULL,
	"champion_id" integer NOT NULL,
	"champion_name" text NOT NULL,
	"placement" integer NOT NULL,
	"player_subteam_id" integer NOT NULL,
	"win" boolean NOT NULL,
	"augments" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"items" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"kills" integer NOT NULL,
	"deaths" integer NOT NULL,
	"assists" integer NOT NULL,
	"total_damage_dealt_to_champions" integer NOT NULL,
	"gold_earned" integer NOT NULL,
	"champ_level" integer NOT NULL,
	CONSTRAINT "participants_match_id_puuid_pk" PRIMARY KEY("match_id","puuid")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"region" text DEFAULT 'euw' NOT NULL,
	"game_name" text NOT NULL,
	"tag_line" text NOT NULL,
	"riot_id_norm" text NOT NULL,
	"puuid" text,
	"status" text DEFAULT 'resolving' NOT NULL,
	"challenge_value" double precision,
	"challenge_level" text,
	"challenge_checked_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_riot_id_norm_unique" UNIQUE("riot_id_norm"),
	CONSTRAINT "profiles_puuid_unique" UNIQUE("puuid")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"riot_api_key" text,
	"key_status" text DEFAULT 'unknown' NOT NULL,
	"key_status_since" timestamp with time zone,
	"key_status_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_singleton" CHECK ("settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "sync_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"kind" text NOT NULL,
	"interactive" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"match_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"total_ids" integer DEFAULT 0 NOT NULL,
	"fetched" integer DEFAULT 0 NOT NULL,
	"list_cursor" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_run_at" timestamp with time zone,
	"last_served_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_match_id_matches_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("match_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "participants_puuid_idx" ON "participants" USING btree ("puuid");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_jobs_one_active_per_profile_idx" ON "sync_jobs" USING btree ("profile_id") WHERE "sync_jobs"."status" in ('pending', 'listing', 'fetching');--> statement-breakpoint
CREATE INDEX "sync_jobs_status_idx" ON "sync_jobs" USING btree ("status");