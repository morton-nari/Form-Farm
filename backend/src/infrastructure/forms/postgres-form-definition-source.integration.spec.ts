import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { Pool } from 'pg';

import { GetFormDefinition } from '../../application/forms/get-form-definition.js';
import { createDatabase } from '../database/create-database.js';
import type { FormFarmDatabase } from '../database/create-database.js';
import { CUSTOMER_FEEDBACK_FORM } from './customer-feedback.form.js';
import { PostgresFormDefinitionSource } from './postgres-form-definition-source.js';

describe('PostgresFormDefinitionSource', () => {
  let container: StartedTestContainer;
  let pool: Pool;
  let closeDatabase: () => Promise<void>;
  let useCase: GetFormDefinition;

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
    const migration = await readFile(
      fileURLToPath(new URL('../../../drizzle/0000_initial_form_read.sql', import.meta.url)),
      'utf8',
    );
    await pool.query(migration);

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
      `insert into forms (id, status, latest_version) values ('draft-form', 'draft', 0)`,
    );

    await expect(useCase.execute('draft-form')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('enforces relational and JSONB identity consistency', async () => {
    await pool.query(`insert into forms (id, status) values ('invalid-form', 'draft')`);

    await expect(
      pool.query(
        `insert into form_versions (form_id, version, schema_version, definition)
         values ('invalid-form', 1, 1, $1::jsonb)`,
        [JSON.stringify({ ...CUSTOMER_FEEDBACK_FORM, id: 'different-form' })],
      ),
    ).rejects.toMatchObject({ constraint: 'form_versions_definition_identity_check' });
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

  async function insertPublishedForm(formId: string, definition: unknown): Promise<void> {
    await pool.query('begin');
    try {
      await pool.query(`insert into forms (id, status, latest_version) values ($1, 'draft', 1)`, [
        formId,
      ]);
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
});
