import {
  check,
  bigint,
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

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    normalizedEmail: text('normalized_email').notNull(),
    passwordHash: text('password_hash').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('users_email_length_check', sql`char_length(${table.email}) between 3 and 254`),
    check(
      'users_normalized_email_length_check',
      sql`char_length(${table.normalizedEmail}) between 3 and 254`,
    ),
    check('users_password_hash_check', sql`char_length(${table.passwordHash}) > 0`),
    check('users_status_check', sql`${table.status} in ('active', 'disabled')`),
    uniqueIndex('users_normalized_email_uidx').on(table.normalizedEmail),
  ],
);

export const userSessions = pgTable(
  'user_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    idleExpiresAt: timestamp('idle_expires_at', { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp('absolute_expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({ columns: [table.userId], foreignColumns: [users.id] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    check('user_sessions_token_hash_check', sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check(
      'user_sessions_expiry_check',
      sql`${table.lastSeenAt} >= ${table.createdAt}
        and ${table.idleExpiresAt} > ${table.lastSeenAt}
        and ${table.idleExpiresAt} <= ${table.absoluteExpiresAt}
        and ${table.absoluteExpiresAt} > ${table.createdAt}`,
    ),
    uniqueIndex('user_sessions_token_hash_uidx').on(table.tokenHash),
    index('user_sessions_user_active_idx')
      .on(table.userId, table.absoluteExpiresAt)
      .where(sql`${table.revokedAt} is null`),
    index('user_sessions_cleanup_idx').on(
      table.revokedAt,
      table.idleExpiresAt,
      table.absoluteExpiresAt,
    ),
  ],
);

export const authRateLimits = pgTable(
  'auth_rate_limits',
  {
    scope: text('scope').notNull(),
    keyHash: text('key_hash').notNull(),
    windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull(),
    attemptCount: integer('attempt_count').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.scope, table.keyHash] }),
    check(
      'auth_rate_limits_scope_check',
      sql`${table.scope} in ('registration-source', 'registration-account', 'login-source', 'login-account')`,
    ),
    check('auth_rate_limits_key_hash_check', sql`${table.keyHash} ~ '^[0-9a-f]{64}$'`),
    check('auth_rate_limits_attempt_count_check', sql`${table.attemptCount} > 0`),
    index('auth_rate_limits_cleanup_idx').on(table.updatedAt),
  ],
);

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
    ownerUserId: uuid('owner_user_id'),
    ownershipKind: text('ownership_kind').notNull(),
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
    foreignKey({ columns: [table.ownerUserId], foreignColumns: [users.id] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    check(
      'forms_ownership_check',
      sql`(${table.ownershipKind} = 'user' and ${table.ownerUserId} is not null)
        or (${table.ownershipKind} = 'system' and ${table.ownerUserId} is null)`,
    ),
    index('forms_owner_updated_at_idx')
      .on(table.ownerUserId, table.updatedAt.desc())
      .where(sql`${table.ownershipKind} = 'user'`),
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

export const formDrafts = pgTable(
  'form_drafts',
  {
    formId: text('form_id').primaryKey(),
    definition: jsonb('definition').notNull(),
    revision: bigint('revision', { mode: 'number' }).notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({ columns: [table.formId], foreignColumns: [forms.id] })
      .onDelete('restrict')
      .onUpdate('restrict'),
    check(
      'form_drafts_revision_check',
      sql`${table.revision} between 1 and 9007199254740991`,
    ),
    check('form_drafts_definition_object_check', sql`jsonb_typeof(${table.definition}) = 'object'`),
    check(
      'form_drafts_definition_identity_check',
      sql`${table.definition}->>'id' = ${table.formId}
        and (${table.definition}->>'schemaVersion')::integer > 0
        and (${table.definition}->>'formVersion')::integer > 0`,
    ),
    index('form_drafts_updated_at_idx').on(table.updatedAt.desc(), table.formId),
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
