import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { Pool } from 'pg';

import { GetFormDefinition } from '../../application/forms/get-form-definition.js';
import { SubmitForm } from '../../application/forms/submit-form.js';
import { createDatabase } from '../database/create-database.js';
import type { FormFarmDatabase } from '../database/create-database.js';
import { CUSTOMER_FEEDBACK_FORM } from './customer-feedback.form.js';
import { PostgresFormDefinitionSource } from './postgres-form-definition-source.js';
import { PostgresFormSubmissionTransaction } from './postgres-form-submission-transaction.js';

describe('PostgresFormDefinitionSource', () => {
  let container: StartedTestContainer;
  let pool: Pool;
  let closeDatabase: () => Promise<void>;
  let useCase: GetFormDefinition;
  let submitForm: SubmitForm;

  beforeAll(async () => {
    container = await new GenericContainer('postgres:18-alpine')
      .withEnvironment({
        POSTGRES_DB: 'form_farm_test',
        POSTGRES_USER: 'form_farm',
        POSTGRES_PASSWORD: 'form_farm_test',
      })
      .withExposedPorts(5432)
      // The image starts a temporary initialization server before the final server.
      // Waiting for the second ready message avoids connecting during that restart window.
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start();

    const databaseUrl = `postgresql://form_farm:form_farm_test@${container.getHost()}:${container.getMappedPort(5432)}/form_farm_test`;
    pool = new Pool({ connectionString: databaseUrl });
    for (const migrationName of [
      '0000_initial_form_read.sql',
      '0001_versioned_form_submissions.sql',
      '0002_authentication_ownership_core.sql',
    ]) {
      const migration = await readFile(
        fileURLToPath(new URL(`../../../drizzle/${migrationName}`, import.meta.url)),
        'utf8',
      );
      await pool.query(migration);
    }

    const database = createDatabase({
      environment: 'test',
      host: '127.0.0.1',
      port: 3000,
      logLevel: 'silent',
      databaseUrl,
      databasePoolMax: 2,
    });
    closeDatabase = database.close;
    useCase = new GetFormDefinition(new PostgresFormDefinitionSource(database.database));
    submitForm = new SubmitForm(new PostgresFormSubmissionTransaction(database.database));
  }, 60_000);

  afterAll(async () => {
    await closeDatabase?.();
    await closeDatabase?.();
    await pool?.end();
    await container?.stop();
  });

  it('loads the current published definition through runtime validation', async () => {
    await insertPublishedForm('customer-feedback', CUSTOMER_FEEDBACK_FORM);

    await expect(useCase.execute('customer-feedback')).resolves.toEqual(CUSTOMER_FEEDBACK_FORM);
  });

  it('returns not found for an unknown form', async () => {
    await expect(useCase.execute('missing-form')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('does not return a draft version as published', async () => {
    await pool.query(
      `insert into forms (id, status, latest_version, ownership_kind)
       values ('draft-form', 'draft', 0, 'system')`,
    );

    await expect(useCase.execute('draft-form')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('enforces relational and JSONB identity consistency', async () => {
    await pool.query(
      `insert into forms (id, status, ownership_kind) values ('invalid-form', 'draft', 'system')`,
    );

    await expect(
      pool.query(
        `insert into form_versions (form_id, version, schema_version, definition)
         values ('invalid-form', 1, 1, $1::jsonb)`,
        [JSON.stringify({ ...CUSTOMER_FEEDBACK_FORM, id: 'different-form' })],
      ),
    ).rejects.toMatchObject({ constraint: 'form_versions_definition_identity_check' });
  });

  it('stores and idempotently replays answers against the rendered version', async () => {
    const key = '550e8400-e29b-41d4-a716-446655440000';
    const request = {
      formId: 'customer-feedback',
      formVersion: 1,
      answers: { overallRating: 'good' },
      idempotencyKey: key,
    };
    const created = await submitForm.execute(request);
    const replayed = await submitForm.execute(request);
    expect(created.replayed).toBe(false);
    expect(replayed).toEqual({ ...created, replayed: true });
    const stored = await pool.query(
      'select form_version, answers from form_submissions where id = $1',
      [created.submissionId],
    );
    expect(stored.rows[0]).toEqual({ form_version: 1, answers: { overallRating: 'good' } });
  });

  it('accepts a previously published non-current version and rejects all versions after archival', async () => {
    const versionTwo = { ...CUSTOMER_FEEDBACK_FORM, formVersion: 2, title: 'Feedback v2' };
    await pool.query(
      `insert into form_versions (form_id, version, schema_version, definition, published_at)
       values ('customer-feedback', 2, 1, $1::jsonb, now())`,
      [JSON.stringify(versionTwo)],
    );
    await pool.query(
      `update forms set latest_version = 2, current_published_version = 2 where id = 'customer-feedback'`,
    );
    const renderedVersionRequest = {
      ...submissionRequest('550e8400-e29b-41d4-a716-446655440001'),
      formVersion: 1,
    };
    await expect(submitForm.execute(renderedVersionRequest)).resolves.toMatchObject({
      replayed: false,
    });

    await pool.query(
      `update forms set status = 'archived', archived_at = now() where id = 'customer-feedback'`,
    );
    await expect(submitForm.execute(renderedVersionRequest)).resolves.toMatchObject({
      replayed: true,
    });
    await expect(
      submitForm.execute(submissionRequest('550e8400-e29b-41d4-a716-446655440002')),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('rejects conflicting idempotency-key reuse', async () => {
    const key = '550e8400-e29b-41d4-a716-446655440003';
    await insertPublishedForm('idempotency-form', {
      ...CUSTOMER_FEEDBACK_FORM,
      id: 'idempotency-form',
    });
    await submitForm.execute({
      ...submissionRequest(key),
      formId: 'idempotency-form',
      formVersion: 1,
    });
    await expect(
      submitForm.execute({
        ...submissionRequest(key),
        formId: 'idempotency-form',
        formVersion: 1,
        answers: { overallRating: 'excellent' },
      }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('resolves concurrent identical idempotent requests to one stored result', async () => {
    await insertPublishedForm('concurrent-form', {
      ...CUSTOMER_FEEDBACK_FORM,
      id: 'concurrent-form',
    });
    const request = {
      formId: 'concurrent-form',
      formVersion: 1,
      answers: { overallRating: 'good' },
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440004',
    };
    const results = await Promise.all([submitForm.execute(request), submitForm.execute(request)]);
    expect(new Set(results.map((result) => result.submissionId)).size).toBe(1);
    expect(results.map((result) => result.replayed).sort()).toEqual([false, true]);
    const count = await pool.query(
      `select count(*)::integer as count from form_submissions where idempotency_key = $1`,
      [request.idempotencyKey],
    );
    expect(count.rows[0].count).toBe(1);
  });

  it('does not expose a draft or never-published version', async () => {
    await pool.query(
      `insert into forms (id, status, latest_version, ownership_kind)
       values ('never-published', 'draft', 1, 'system')`,
    );
    await pool.query(
      `insert into form_versions (form_id, version, schema_version, definition)
       values ('never-published', 1, 1, $1::jsonb)`,
      [JSON.stringify({ ...CUSTOMER_FEEDBACK_FORM, id: 'never-published' })],
    );
    await expect(
      submitForm.execute({
        formId: 'never-published',
        formVersion: 1,
        answers: { overallRating: 'good' },
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440005',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('rejects an unpublished version of an otherwise published form', async () => {
    await insertPublishedForm('unpublished-version-form', {
      ...CUSTOMER_FEEDBACK_FORM,
      id: 'unpublished-version-form',
    });
    await pool.query(
      `insert into form_versions (form_id, version, schema_version, definition)
       values ('unpublished-version-form', 2, 1, $1::jsonb)`,
      [
        JSON.stringify({
          ...CUSTOMER_FEEDBACK_FORM,
          id: 'unpublished-version-form',
          formVersion: 2,
        }),
      ],
    );
    await pool.query(`update forms set latest_version = 2 where id = 'unpublished-version-form'`);

    await expect(
      submitForm.execute({
        formId: 'unpublished-version-form',
        formVersion: 2,
        answers: { overallRating: 'good' },
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440006',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('fails closed when persisted data becomes malformed', async () => {
    await insertPublishedForm('malformed-form', {
      ...CUSTOMER_FEEDBACK_FORM,
      id: 'malformed-form',
    });
    await pool.query('alter table form_versions disable trigger all');
    await pool.query(
      `alter table form_versions drop constraint form_versions_definition_identity_check`,
    );
    await pool.query(
      `update form_versions set definition = $1::jsonb where form_id = 'malformed-form'`,
      [JSON.stringify({ id: 'malformed-form', formVersion: 1, schemaVersion: 1 })],
    );

    await expect(useCase.execute('malformed-form')).rejects.toMatchObject({
      name: 'InvalidStoredFormDefinitionError',
    });

    await pool.query(
      `update form_versions set definition = $1::jsonb where form_id = 'malformed-form'`,
      [JSON.stringify(CUSTOMER_FEEDBACK_FORM)],
    );
    await expect(useCase.execute('malformed-form')).rejects.toMatchObject({
      name: 'InvalidStoredFormDefinitionError',
    });

    await expect(
      submitForm.execute({
        formId: 'malformed-form',
        formVersion: 1,
        answers: { overallRating: 'good' },
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440007',
      }),
    ).rejects.toMatchObject({ name: 'FormSubmissionPersistenceError' });
    const inserted = await pool.query(
      `select count(*)::integer as count from form_submissions where form_id = 'malformed-form'`,
    );
    expect(inserted.rows[0].count).toBe(0);
  });

  it('wraps query failures without exposing database details', async () => {
    const failingDatabase = {
      select: () => {
        throw new Error('postgresql://secret@host query details');
      },
    } as unknown as FormFarmDatabase;
    const source = new PostgresFormDefinitionSource(failingDatabase);

    await expect(source.findById('customer-feedback')).rejects.toMatchObject({
      name: 'FormDefinitionPersistenceError',
      message: 'Unable to read persisted form definition "customer-feedback".',
    });
  });

  it('wraps submission failures without retaining definitions, answers, or database causes', async () => {
    const failingDatabase = {
      transaction: async () => {
        throw new Error('secret answer and postgresql://credentials');
      },
    } as unknown as FormFarmDatabase;
    const transaction = new PostgresFormSubmissionTransaction(failingDatabase);
    const failure = await transaction
      .execute(
        {
          formId: 'customer-feedback',
          formVersion: 1,
          idempotencyKey: 'key',
          requestFingerprint: 'fingerprint',
        },
        () => ({ secretField: 'secret answer' }),
      )
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({
      name: 'FormSubmissionPersistenceError',
      message: 'Unable to persist a submission for form "customer-feedback".',
    });
    expect(failure).not.toHaveProperty('cause');
    expect(JSON.stringify(failure)).not.toContain('secret');
  });

  async function insertPublishedForm(formId: string, definition: unknown): Promise<void> {
    await pool.query('begin');
    try {
      await pool.query(
        `insert into forms (id, status, latest_version, ownership_kind)
         values ($1, 'draft', 1, 'system')`,
        [formId],
      );
      await pool.query(
        `insert into form_versions (form_id, version, schema_version, definition, published_at)
         values ($1, 1, 1, $2::jsonb, now())`,
        [formId, JSON.stringify(definition)],
      );
      await pool.query(
        `update forms set status = 'published', current_published_version = 1 where id = $1`,
        [formId],
      );
      await pool.query('commit');
    } catch (error) {
      await pool.query('rollback');
      throw error;
    }
  }

  function submissionRequest(idempotencyKey: string) {
    return {
      formId: 'customer-feedback',
      formVersion: 2,
      answers: { overallRating: 'good' },
      idempotencyKey,
    };
  }
});
