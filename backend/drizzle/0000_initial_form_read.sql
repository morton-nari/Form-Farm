CREATE TABLE "forms" (
  "id" text PRIMARY KEY NOT NULL,
  "status" text NOT NULL,
  "latest_version" integer DEFAULT 0 NOT NULL,
  "current_published_version" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone,
  CONSTRAINT "forms_id_format_check" CHECK ("id" ~ '^[A-Za-z][A-Za-z0-9_-]*$'),
  CONSTRAINT "forms_latest_version_check" CHECK ("latest_version" >= 0),
  CONSTRAINT "forms_status_check" CHECK ("status" in ('draft', 'published', 'archived')),
  CONSTRAINT "forms_published_pointer_check" CHECK ("current_published_version" is null or "current_published_version" <= "latest_version"),
  CONSTRAINT "forms_lifecycle_check" CHECK (
    ("status" = 'draft' and "current_published_version" is null and "archived_at" is null)
    or ("status" = 'published' and "current_published_version" is not null and "archived_at" is null)
    or ("status" = 'archived' and "archived_at" is not null)
  )
);

CREATE TABLE "form_versions" (
  "form_id" text NOT NULL,
  "version" integer NOT NULL,
  "schema_version" integer NOT NULL,
  "definition" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "published_at" timestamp with time zone,
  CONSTRAINT "form_versions_form_id_version_pk" PRIMARY KEY("form_id", "version"),
  CONSTRAINT "form_versions_version_check" CHECK ("version" > 0),
  CONSTRAINT "form_versions_schema_version_check" CHECK ("schema_version" > 0),
  CONSTRAINT "form_versions_definition_object_check" CHECK (jsonb_typeof("definition") = 'object'),
  CONSTRAINT "form_versions_definition_identity_check" CHECK (
    "definition"->>'id' = "form_id"
    AND ("definition"->>'formVersion')::integer = "version"
    AND ("definition"->>'schemaVersion')::integer = "schema_version"
  )
);

ALTER TABLE "form_versions" ADD CONSTRAINT "form_versions_form_id_forms_id_fk"
  FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "forms" ADD CONSTRAINT "forms_current_published_version_fk"
  FOREIGN KEY ("id", "current_published_version")
  REFERENCES "form_versions"("form_id", "version") MATCH SIMPLE ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX "form_versions_form_id_published_at_idx"
  ON "form_versions" ("form_id", "published_at" DESC);
