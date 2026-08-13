import {
  check,
  foreignKey,
  integer,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const forms = pgTable(
  'forms',
  {
    id: text('id').primaryKey(),
    status: text('status').notNull(),
    latestVersion: integer('latest_version').notNull().default(0),
    currentPublishedVersion: integer('current_published_version'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [
    check('forms_id_format_check', sql`${table.id} ~ '^[A-Za-z][A-Za-z0-9_-]*$'`),
    check('forms_latest_version_check', sql`${table.latestVersion} >= 0`),
    check('forms_status_check', sql`${table.status} in ('draft', 'published', 'archived')`),
    check(
      'forms_published_pointer_check',
      sql`${table.currentPublishedVersion} is null or ${table.currentPublishedVersion} <= ${table.latestVersion}`,
    ),
    check(
      'forms_lifecycle_check',
      sql`(
      (${table.status} = 'draft' and ${table.currentPublishedVersion} is null and ${table.archivedAt} is null)
      or (${table.status} = 'published' and ${table.currentPublishedVersion} is not null and ${table.archivedAt} is null)
      or (${table.status} = 'archived' and ${table.archivedAt} is not null)
    )`,
    ),
  ],
);

export const formVersions = pgTable(
  'form_versions',
  {
    formId: text('form_id').notNull(),
    version: integer('version').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    definition: jsonb('definition').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.formId, table.version] }),
    foreignKey({ columns: [table.formId], foreignColumns: [forms.id] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    check('form_versions_version_check', sql`${table.version} > 0`),
    check('form_versions_schema_version_check', sql`${table.schemaVersion} > 0`),
    check(
      'form_versions_definition_object_check',
      sql`jsonb_typeof(${table.definition}) = 'object'`,
    ),
    check(
      'form_versions_definition_identity_check',
      sql`${table.definition}->>'id' = ${table.formId}
        and (${table.definition}->>'formVersion')::integer = ${table.version}
        and (${table.definition}->>'schemaVersion')::integer = ${table.schemaVersion}`,
    ),
  ],
);

export const formSubmissions = pgTable(
  'form_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    formId: text('form_id').notNull(),
    formVersion: integer('form_version').notNull(),
    answers: jsonb('answers').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.formId, table.formVersion],
      foreignColumns: [formVersions.formId, formVersions.version],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    check('form_submissions_answers_object_check', sql`jsonb_typeof(${table.answers}) = 'object'`),
    check(
      'form_submissions_idempotency_key_check',
      sql`length(${table.idempotencyKey}) between 1 and 64`,
    ),
    check(
      'form_submissions_request_fingerprint_check',
      sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    uniqueIndex('form_submissions_idempotency_key_uidx').on(table.idempotencyKey),
    index('form_submissions_form_submitted_at_idx').on(table.formId, table.submittedAt.desc()),
    index('form_submissions_form_version_idx').on(table.formId, table.formVersion),
  ],
);
