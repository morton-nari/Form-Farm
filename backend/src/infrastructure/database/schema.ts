import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
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
