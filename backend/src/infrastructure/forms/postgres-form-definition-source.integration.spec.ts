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
import { PostgresAccessibleFormSource } from './postgres-accessible-form-source.js';
import { PostgresCreateFormDraftTransaction } from './postgres-create-form-draft-transaction.js';
import { CreateFormDraft } from '../../application/forms/create-form-draft.js';
import { GetOwnerFormDraft, SaveOwnerFormDraft } from '../../application/forms/owner-form-draft.js';
import { PostgresOwnerFormDraftStore } from './postgres-owner-form-draft-store.js';
import { PublishFormDraft } from '../../application/forms/publish-form-draft.js';
import { PostgresPublishFormDraftTransaction } from './postgres-publish-form-draft-transaction.js';
import { BootstrapFormDraft } from '../../application/forms/bootstrap-form-draft.js';
import { PostgresBootstrapFormDraftTransaction } from './postgres-bootstrap-form-draft-transaction.js';
import { PostgresOwnerFormManagementSource } from './postgres-owner-form-management-source.js';
import { ListOwnerManagedForms } from '../../application/forms/list-owner-managed-forms.js';

describe('PostgresFormDefinitionSource', () => {
  let container: StartedTestContainer;
  let pool: Pool;
  let closeDatabase: () => Promise<void>;
  let useCase: GetFormDefinition;
  let submitForm: SubmitForm;
  let accessibleSource: PostgresAccessibleFormSource;
  let formFarmDatabase: FormFarmDatabase;
  let ownerDraftStore: PostgresOwnerFormDraftStore;

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
      '0003_owner_form_drafts.sql',
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
    formFarmDatabase = database.database;
    ownerDraftStore = new PostgresOwnerFormDraftStore(database.database);
    useCase = new GetFormDefinition(new PostgresFormDefinitionSource(database.database));
    submitForm = new SubmitForm(new PostgresFormSubmissionTransaction(database.database));
    accessibleSource = new PostgresAccessibleFormSource(database.database);
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

  it('lists and loads only system forms and forms owned by the authenticated user', async () => {
    const ownerId = '10000000-0000-4000-8000-000000000001';
    const otherId = '10000000-0000-4000-8000-000000000002';
    await pool.query(
      `insert into users (id, email, normalized_email, password_hash) values
       ($1, 'owner@example.com', 'owner@example.com', 'hash'),
       ($2, 'other@example.com', 'other@example.com', 'hash')
       on conflict (id) do nothing`,
      [ownerId, otherId],
    );
    await insertOwnedPublishedForm('owned-dashboard-form', ownerId);
    await insertOwnedPublishedForm('other-dashboard-form', otherId);

    const listed = await accessibleSource.listPublishedForUser(ownerId);
    expect(listed.map((row) => row.rowFormId)).toContain('owned-dashboard-form');
    expect(listed.map((row) => row.rowFormId)).not.toContain('other-dashboard-form');
    await expect(
      accessibleSource.findPublishedByIdForUser('other-dashboard-form', ownerId),
    ).resolves.toBeUndefined();
    await expect(
      accessibleSource.findPublishedByIdForUser('owned-dashboard-form', ownerId),
    ).resolves.toMatchObject({ rowFormId: 'owned-dashboard-form' });
  });

  it('creates the owner form and revision-1 draft atomically and resolves concurrent IDs once', async () => {
    const ownerId = '20000000-0000-4000-8000-000000000001';
    await pool.query(
      `insert into users (id, email, normalized_email, password_hash)
       values ($1, 'creator@example.com', 'creator@example.com', 'hash') on conflict (id) do nothing`,
      [ownerId],
    );
    const useCase = new CreateFormDraft(new PostgresCreateFormDraftTransaction(formFarmDatabase));
    const definition = { ...CUSTOMER_FEEDBACK_FORM, id: 'concurrent-created-form' };
    const outcomes = await Promise.allSettled([
      useCase.execute({ userId: ownerId }, definition),
      useCase.execute({ userId: ownerId }, definition),
    ]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1);
    await expect(
      pool.query(
        `select f.owner_user_id, f.ownership_kind, f.latest_version, d.revision, d.definition
         from forms f join form_drafts d on d.form_id = f.id where f.id = $1`,
        [definition.id],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          owner_user_id: ownerId,
          ownership_kind: 'user',
          latest_version: 0,
          revision: '1',
          definition,
        },
      ],
    });
  });

  it('rolls back without an orphan form when draft creation cannot complete', async () => {
    const useCase = new CreateFormDraft(new PostgresCreateFormDraftTransaction(formFarmDatabase));
    const definition = { ...CUSTOMER_FEEDBACK_FORM, id: 'rolled-back-created-form' };
    await expect(
      useCase.execute({ userId: '20000000-0000-4000-8000-999999999999' }, definition),
    ).rejects.toMatchObject({ name: 'CreateFormDraftPersistenceError' });
    await expect(
      pool.query('select id from forms where id = $1', [definition.id]),
    ).resolves.toMatchObject({ rowCount: 0 });
  });

  it('loads and saves only an owner draft and resolves concurrent saves without lost updates', async () => {
    const ownerId = '30000000-0000-4000-8000-000000000001';
    const otherId = '30000000-0000-4000-8000-000000000002';
    await pool.query(
      `insert into users (id, email, normalized_email, password_hash) values
       ($1, 'draft-owner@example.com', 'draft-owner@example.com', 'hash'),
       ($2, 'draft-other@example.com', 'draft-other@example.com', 'hash')`,
      [ownerId, otherId],
    );
    const definition = { ...CUSTOMER_FEEDBACK_FORM, id: 'saved-owner-draft' };
    await new CreateFormDraft(new PostgresCreateFormDraftTransaction(formFarmDatabase)).execute(
      { userId: ownerId },
      definition,
    );
    const getDraft = new GetOwnerFormDraft(ownerDraftStore);
    const saveDraft = new SaveOwnerFormDraft(ownerDraftStore);
    await expect(getDraft.execute({ userId: ownerId }, definition.id)).resolves.toMatchObject({
      draftRevision: 1,
      definition,
    });
    await expect(getDraft.execute({ userId: otherId }, definition.id)).rejects.toMatchObject({
      code: 'not_found',
    });

    const outcomes = await Promise.allSettled([
      saveDraft.execute({ userId: ownerId }, definition.id, 1, {
        ...definition,
        title: 'First update',
      }),
      saveDraft.execute({ userId: ownerId }, definition.id, 1, {
        ...definition,
        title: 'Second update',
      }),
    ]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(outcomes.find((result) => result.status === 'fulfilled')?.value).toMatchObject({
      draftRevision: 2,
    });
    expect(outcomes.find((result) => result.status === 'rejected')?.reason).toMatchObject({
      code: 'conflict',
    });
    const stored = await pool.query(
      `select d.revision, d.definition, d.updated_at = f.updated_at as timestamps_match
       from form_drafts d join forms f on f.id = d.form_id where d.form_id = $1`,
      [definition.id],
    );
    expect(stored.rows[0].revision).toBe('2');
    expect(['First update', 'Second update']).toContain(stored.rows[0].definition.title);
    expect(stored.rows[0].timestamps_match).toBe(true);
  });

  it('fails closed when draft JSON version no longer matches relational state', async () => {
    const ownerId = '30000000-0000-4000-8000-000000000003';
    await pool.query(
      `insert into users (id, email, normalized_email, password_hash)
       values ($1, 'identity-owner@example.com', 'identity-owner@example.com', 'hash')`,
      [ownerId],
    );
    const definition = { ...CUSTOMER_FEEDBACK_FORM, id: 'invalid-owner-draft-identity' };
    await new CreateFormDraft(new PostgresCreateFormDraftTransaction(formFarmDatabase)).execute(
      { userId: ownerId },
      definition,
    );
    await pool.query('update forms set latest_version = 1 where id = $1', [definition.id]);
    await expect(
      new GetOwnerFormDraft(ownerDraftStore).execute({ userId: ownerId }, definition.id),
    ).rejects.toMatchObject({ name: 'InvalidStoredFormDefinitionError' });
    await expect(
      new PublishFormDraft(new PostgresPublishFormDraftTransaction(formFarmDatabase)).execute(
        { userId: ownerId },
        definition.id,
        1,
      ),
    ).rejects.toMatchObject({ name: 'InvalidStoredFormDefinitionError' });
    await expect(
      pool.query(
        `select count(v.*)::integer as versions, count(d.*)::integer as drafts
         from forms f left join form_versions v on v.form_id = f.id
         left join form_drafts d on d.form_id = f.id where f.id = $1 group by f.id`,
        [definition.id],
      ),
    ).resolves.toMatchObject({ rows: [{ versions: 0, drafts: 1 }] });
  });

  it('round-trips an incomplete draft and refuses to publish it', async () => {
    const ownerId = '30000000-0000-4000-8000-000000000004';
    await pool.query(
      `insert into users (id, email, normalized_email, password_hash)
       values ($1, 'incomplete-owner@example.com', 'incomplete-owner@example.com', 'hash')`,
      [ownerId],
    );
    const definition = {
      ...CUSTOMER_FEEDBACK_FORM,
      id: 'incomplete-owner-draft',
      sections: [{ ...CUSTOMER_FEEDBACK_FORM.sections[0], fields: [] }],
    };
    await new CreateFormDraft(new PostgresCreateFormDraftTransaction(formFarmDatabase)).execute(
      { userId: ownerId },
      definition,
    );
    const save = new SaveOwnerFormDraft(ownerDraftStore);
    await expect(
      save.execute({ userId: ownerId }, definition.id, 1, {
        ...definition,
        title: 'Incomplete saved draft',
      }),
    ).resolves.toMatchObject({
      draftRevision: 2,
      definition: { title: 'Incomplete saved draft', sections: [{ fields: [] }] },
    });
    await expect(
      new GetOwnerFormDraft(ownerDraftStore).execute({ userId: ownerId }, definition.id),
    ).resolves.toMatchObject({
      draftRevision: 2,
      definition: { title: 'Incomplete saved draft', sections: [{ fields: [] }] },
    });
    await expect(
      new PublishFormDraft(new PostgresPublishFormDraftTransaction(formFarmDatabase)).execute(
        { userId: ownerId },
        definition.id,
        2,
      ),
    ).rejects.toMatchObject({
      name: 'UnpublishableFormError',
      issues: [{ path: ['sections', 0, 'fields'], code: 'incomplete_definition' }],
    });
    await expect(
      pool.query(
        `select f.latest_version, f.current_published_version,
                count(v.*)::integer as versions, count(d.*)::integer as drafts,
                min(d.revision)::text as draft_revision
         from forms f left join form_versions v on v.form_id = f.id
         left join form_drafts d on d.form_id = f.id where f.id = $1 group by f.id`,
        [definition.id],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          latest_version: 0,
          current_published_version: null,
          versions: 0,
          drafts: 1,
          draft_revision: '2',
        },
      ],
    });

    const completedDefinition = {
      ...definition,
      title: 'Completed saved draft',
      sections: CUSTOMER_FEEDBACK_FORM.sections,
    };
    await expect(
      save.execute({ userId: ownerId }, definition.id, 2, completedDefinition),
    ).resolves.toMatchObject({ draftRevision: 3, definition: completedDefinition });
    await expect(
      new PublishFormDraft(new PostgresPublishFormDraftTransaction(formFarmDatabase)).execute(
        { userId: ownerId },
        definition.id,
        3,
      ),
    ).resolves.toMatchObject({ status: 'published', formVersion: 1 });
    await expect(
      pool.query(
        `select f.status, f.latest_version, f.current_published_version,
                count(v.*)::integer as versions, count(d.*)::integer as drafts
         from forms f left join form_versions v on v.form_id = f.id
         left join form_drafts d on d.form_id = f.id where f.id = $1 group by f.id`,
        [definition.id],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          status: 'published',
          latest_version: 1,
          current_published_version: 1,
          versions: 1,
          drafts: 0,
        },
      ],
    });
  });

  it('publishes one immutable version atomically and resolves a concurrent publication once', async () => {
    const ownerId = '40000000-0000-4000-8000-000000000001';
    await pool.query(
      `insert into users (id, email, normalized_email, password_hash)
       values ($1, 'publisher@example.com', 'publisher@example.com', 'hash')`,
      [ownerId],
    );
    const definition = { ...CUSTOMER_FEEDBACK_FORM, id: 'published-owner-draft' };
    await new CreateFormDraft(new PostgresCreateFormDraftTransaction(formFarmDatabase)).execute(
      { userId: ownerId },
      definition,
    );
    const publish = new PublishFormDraft(new PostgresPublishFormDraftTransaction(formFarmDatabase));
    const outcomes = await Promise.allSettled([
      publish.execute({ userId: ownerId }, definition.id, 1),
      publish.execute({ userId: ownerId }, definition.id, 1),
    ]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(outcomes.find((result) => result.status === 'fulfilled')?.value).toMatchObject({
      formVersion: 1,
      status: 'published',
    });
    expect(outcomes.find((result) => result.status === 'rejected')?.reason).toMatchObject({
      code: 'conflict',
    });
    const stored = await pool.query(
      `select f.status, f.latest_version, f.current_published_version,
              f.updated_at = max(v.published_at) as timestamps_match,
              count(v.*)::integer as version_count, count(d.*)::integer as draft_count
       from forms f left join form_versions v on v.form_id = f.id
       left join form_drafts d on d.form_id = f.id
       where f.id = $1
       group by f.id`,
      [definition.id],
    );
    expect(stored.rows[0]).toMatchObject({
      status: 'published',
      latest_version: 1,
      current_published_version: 1,
      version_count: 1,
      draft_count: 0,
      timestamps_match: true,
    });
    await expect(
      submitForm.execute({
        formId: definition.id,
        formVersion: 1,
        answers: { overallRating: 'good' },
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440099',
      }),
    ).resolves.toMatchObject({ replayed: false });
  });

  it('leaves an unpublishable password draft and lifecycle state untouched', async () => {
    const ownerId = '40000000-0000-4000-8000-000000000002';
    await pool.query(
      `insert into users (id, email, normalized_email, password_hash)
       values ($1, 'password-publisher@example.com', 'password-publisher@example.com', 'hash')`,
      [ownerId],
    );
    const definition = {
      ...CUSTOMER_FEEDBACK_FORM,
      id: 'unpublishable-password-draft',
      sections: [
        {
          ...CUSTOMER_FEEDBACK_FORM.sections[0],
          fields: [{ id: 'secret', label: 'Secret', type: 'password' as const }],
        },
      ],
    };
    await new CreateFormDraft(new PostgresCreateFormDraftTransaction(formFarmDatabase)).execute(
      { userId: ownerId },
      definition,
    );
    await expect(
      new PublishFormDraft(new PostgresPublishFormDraftTransaction(formFarmDatabase)).execute(
        { userId: ownerId },
        definition.id,
        1,
      ),
    ).rejects.toMatchObject({ name: 'UnpublishableFormError' });
    await expect(
      pool.query(
        `select f.status, f.latest_version, f.current_published_version,
                count(v.*)::integer as versions, count(d.*)::integer as drafts
         from forms f left join form_versions v on v.form_id = f.id
         left join form_drafts d on d.form_id = f.id where f.id = $1 group by f.id`,
        [definition.id],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          status: 'draft',
          latest_version: 0,
          current_published_version: null,
          versions: 0,
          drafts: 1,
        },
      ],
    });
  });

  it('bootstraps one next-version draft concurrently without replacing it', async () => {
    const ownerId = '50000000-0000-4000-8000-000000000001';
    await pool.query(
      `insert into users (id, email, normalized_email, password_hash)
       values ($1, 'editor@example.com', 'editor@example.com', 'hash')`,
      [ownerId],
    );
    await insertOwnedPublishedForm('bootstrap-owner-form', ownerId);
    const bootstrap = new BootstrapFormDraft(
      new PostgresBootstrapFormDraftTransaction(formFarmDatabase),
    );
    const results = await Promise.all([
      bootstrap.execute({ userId: ownerId }, 'bootstrap-owner-form'),
      bootstrap.execute({ userId: ownerId }, 'bootstrap-owner-form'),
    ]);
    expect(results.map((result) => result.created).sort()).toEqual([false, true]);
    expect(
      results.every((result) => result.draftRevision === 1 && result.definition.formVersion === 2),
    ).toBe(true);
    expect(results[0].definition).toEqual(results[1].definition);
    const stored = await pool.query(
      `select count(*)::integer as count, min(revision)::text as revision,
              min((definition->>'formVersion')::integer) as form_version
       from form_drafts where form_id = 'bootstrap-owner-form'`,
    );
    expect(stored.rows[0]).toEqual({ count: 1, revision: '1', form_version: 2 });
  });

  it('lists only owner-managed forms across lifecycle states in deterministic pages', async () => {
    const ownerId = '60000000-0000-4000-8000-000000000001';
    const otherId = '60000000-0000-4000-8000-000000000002';
    await pool.query(
      `insert into users (id, email, normalized_email, password_hash) values
       ($1, 'manager@example.com', 'manager@example.com', 'hash'),
       ($2, 'manager-other@example.com', 'manager-other@example.com', 'hash')`,
      [ownerId, otherId],
    );
    await new CreateFormDraft(new PostgresCreateFormDraftTransaction(formFarmDatabase)).execute(
      { userId: ownerId },
      { ...CUSTOMER_FEEDBACK_FORM, id: 'managed-draft' },
    );
    await insertOwnedPublishedForm('managed-published', ownerId);
    await insertOwnedPublishedForm('managed-other', otherId);
    const list = new ListOwnerManagedForms(new PostgresOwnerFormManagementSource(formFarmDatabase));
    const page = await list.execute(ownerId, 10);
    expect(page.forms.map((form) => form.id).sort()).toEqual([
      'managed-draft',
      'managed-published',
    ]);
    expect(page.forms.find((form) => form.id === 'managed-draft')).toMatchObject({
      status: 'draft',
      draftRevision: 1,
    });
    expect(page.forms.find((form) => form.id === 'managed-published')).toMatchObject({
      status: 'published',
      currentPublishedVersion: 1,
    });
    expect(page.forms.map((form) => form.id)).not.toContain('managed-other');
    expect(page.forms.map((form) => form.id)).not.toContain('customer-feedback');
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

  async function insertOwnedPublishedForm(formId: string, ownerUserId: string): Promise<void> {
    const definition = { ...CUSTOMER_FEEDBACK_FORM, id: formId, title: formId };
    await pool.query('begin');
    try {
      await pool.query(
        `insert into forms (id, status, latest_version, ownership_kind, owner_user_id)
         values ($1, 'draft', 1, 'user', $2)`,
        [formId, ownerUserId],
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
