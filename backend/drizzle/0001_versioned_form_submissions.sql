CREATE TABLE "form_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "form_id" text NOT NULL,
  "form_version" integer NOT NULL,
  "answers" jsonb NOT NULL,
  "idempotency_key" text NOT NULL,
  "request_fingerprint" text NOT NULL,
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "form_submissions_answers_object_check" CHECK (jsonb_typeof("answers") = 'object'),
  CONSTRAINT "form_submissions_idempotency_key_check" CHECK (length("idempotency_key") BETWEEN 1 AND 64),
  CONSTRAINT "form_submissions_request_fingerprint_check" CHECK ("request_fingerprint" ~ '^[0-9a-f]{64}$')
);

ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_version_fk"
  FOREIGN KEY ("form_id", "form_version")
  REFERENCES "form_versions"("form_id", "version") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE UNIQUE INDEX "form_submissions_idempotency_key_uidx"
  ON "form_submissions" ("idempotency_key");
CREATE INDEX "form_submissions_form_submitted_at_idx"
  ON "form_submissions" ("form_id", "submitted_at" DESC);
CREATE INDEX "form_submissions_form_version_idx"
  ON "form_submissions" ("form_id", "form_version");
