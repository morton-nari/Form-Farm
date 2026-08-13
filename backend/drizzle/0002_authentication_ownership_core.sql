CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "normalized_email" text NOT NULL,
  "password_hash" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "users_email_length_check" CHECK (char_length("email") BETWEEN 3 AND 254),
  CONSTRAINT "users_normalized_email_length_check" CHECK (char_length("normalized_email") BETWEEN 3 AND 254),
  CONSTRAINT "users_password_hash_check" CHECK (char_length("password_hash") > 0),
  CONSTRAINT "users_status_check" CHECK ("status" IN ('active', 'disabled'))
);

CREATE UNIQUE INDEX "users_normalized_email_uidx" ON "users" ("normalized_email");

CREATE TABLE "user_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "idle_expires_at" timestamp with time zone NOT NULL,
  "absolute_expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  CONSTRAINT "user_sessions_token_hash_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "user_sessions_expiry_check" CHECK (
    "last_seen_at" >= "created_at"
    AND "idle_expires_at" > "last_seen_at"
    AND "absolute_expires_at" > "created_at"
  )
);

ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "user_sessions_token_hash_uidx" ON "user_sessions" ("token_hash");
CREATE INDEX "user_sessions_user_active_idx" ON "user_sessions" ("user_id", "absolute_expires_at")
  WHERE "revoked_at" IS NULL;
CREATE INDEX "user_sessions_cleanup_idx" ON "user_sessions"
  ("revoked_at", "idle_expires_at", "absolute_expires_at");

CREATE TABLE "auth_rate_limits" (
  "scope" text NOT NULL,
  "key_hash" text NOT NULL,
  "window_started_at" timestamp with time zone NOT NULL,
  "attempt_count" integer NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "auth_rate_limits_pk" PRIMARY KEY ("scope", "key_hash"),
  CONSTRAINT "auth_rate_limits_scope_check" CHECK (char_length("scope") BETWEEN 1 AND 64),
  CONSTRAINT "auth_rate_limits_key_hash_check" CHECK ("key_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "auth_rate_limits_attempt_count_check" CHECK ("attempt_count" > 0)
);
CREATE INDEX "auth_rate_limits_cleanup_idx" ON "auth_rate_limits" ("updated_at");

ALTER TABLE "forms" ADD COLUMN "owner_user_id" uuid;
ALTER TABLE "forms" ADD COLUMN "ownership_kind" text;
UPDATE "forms" SET "ownership_kind" = 'system';
ALTER TABLE "forms" ALTER COLUMN "ownership_kind" SET NOT NULL;
ALTER TABLE "forms" ADD CONSTRAINT "forms_owner_user_id_fk"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "forms" ADD CONSTRAINT "forms_ownership_check" CHECK (
  ("ownership_kind" = 'user' AND "owner_user_id" IS NOT NULL)
  OR ("ownership_kind" = 'system' AND "owner_user_id" IS NULL)
);
CREATE INDEX "forms_owner_updated_at_idx" ON "forms" ("owner_user_id", "updated_at" DESC)
  WHERE "ownership_kind" = 'user';
