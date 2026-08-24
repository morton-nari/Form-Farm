import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { Pool } from 'pg';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CleanupDeveloperCredentials,
  IssueDeveloperCredential,
  ListDeveloperCredentials,
  RevokeDeveloperCredential,
} from '../../application/authentication/developer-credentials.js';
import { ResolveDeveloperCredential } from '../../application/authentication/resolve-developer-credential.js';
import type { AuthenticatedActor } from '../../application/ports/create-form-draft-transaction.js';
import { createDatabase, type FormFarmDatabase } from '../database/create-database.js';
import { migrationNames } from '../database/migration-manifest.js';
import { NodeDeveloperCredentialCodec } from './node-developer-credential-codec.js';
import { PostgresDeveloperCredentialRepository } from './postgres-developer-credential-repository.js';
import { PostgresDeveloperCredentialPasswordSource } from './postgres-developer-credential-password-source.js';
import { PostgresAuthenticationRateLimitRepository } from './postgres-authentication-rate-limit-repository.js';

describe('developer credential PostgreSQL core', () => {
  let container: StartedTestContainer;
  let pool: Pool;
  let database: FormFarmDatabase;
  let closeDatabase: () => Promise<void>;
  let owner: AuthenticatedActor;
  let otherOwner: AuthenticatedActor;
  let repository: PostgresDeveloperCredentialRepository;
  const codec = new NodeDeveloperCredentialCodec();

  beforeAll(async () => {
    container = await new GenericContainer('postgres:18-alpine')
      .withEnvironment({
        POSTGRES_USER: 'form_farm',
        POSTGRES_PASSWORD: 'form_farm_test',
        POSTGRES_DB: 'form_farm_test',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(
        Wait.forLogMessage('database system is ready to accept connections', 2).withStartupTimeout(
          60_000,
        ),
      )
      .start();
    const databaseUrl = `postgresql://form_farm:form_farm_test@${container.getHost()}:${container.getMappedPort(5432)}/form_farm_test`;
    pool = new Pool({ connectionString: databaseUrl });
    for (const migration of migrationNames) await applyMigration(migration);
    const inserted = await pool.query<{ id: string }>(
      `insert into users (email, normalized_email, password_hash)
       values ('credential-owner@example.com', 'credential-owner@example.com', '$argon2id$placeholder'),
              ('other-owner@example.com', 'other-owner@example.com', '$argon2id$placeholder')
       returning id`,
    );
    owner = { userId: inserted.rows[0]!.id };
    otherOwner = { userId: inserted.rows[1]!.id };

    const context = createDatabase({
      environment: 'test',
      host: '127.0.0.1',
      port: 3000,
      logLevel: 'silent',
      databaseUrl,
      databasePoolMax: 8,
    });
    database = context.database;
    closeDatabase = context.close;
    repository = new PostgresDeveloperCredentialRepository(database);
  }, 60_000);

  afterAll(async () => {
    await closeDatabase?.();
    await pool?.end();
    await container?.stop();
  });

  it('stores only verifier and safe metadata while returning the raw credential once', async () => {
    const issued = await new IssueDeveloperCredential(codec, repository).execute(owner, {
      displayName: 'Codex local',
      expiresInDays: 7,
    });
    const stored = await pool.query(
      `select id, user_id, secret_hash, display_name, scope, environment,
              created_at, expires_at, revoked_at, last_used_at
       from developer_credentials where id = $1`,
      [issued.publicId],
    );

    expect(issued.credential).toMatch(/^ffmcp_v1\./);
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]).toMatchObject({
      id: issued.publicId,
      user_id: owner.userId,
      display_name: 'Codex local',
      scope: 'form-intelligence:read',
      environment: 'development',
      revoked_at: null,
      last_used_at: null,
    });
    expect(stored.rows[0].secret_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored.rows)).not.toContain(issued.credential);
    expect(
      JSON.stringify(await new ListDeveloperCredentials(repository).execute(owner)),
    ).not.toContain(stored.rows[0].secret_hash);
  });

  it('enforces the maximum of five active credentials under concurrent issuance', async () => {
    await pool.query(`delete from developer_credentials where user_id = $1`, [otherOwner.userId]);
    const issue = new IssueDeveloperCredential(codec, repository);
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, index) =>
        issue.execute(otherOwner, { displayName: `Client ${index}`, expiresInDays: 30 }),
      ),
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(5);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    await expect(
      pool.query<{ count: string }>(
        `select count(*)::text as count from developer_credentials
         where user_id = $1 and revoked_at is null and expires_at > now()`,
        [otherOwner.userId],
      ),
    ).resolves.toMatchObject({ rows: [{ count: '5' }] });
  });

  it('lists only owner metadata and makes revocation idempotent and owner-scoped', async () => {
    const issued = await new IssueDeveloperCredential(codec, repository).execute(owner, {
      displayName: 'Revocable',
      expiresInDays: 1,
    });
    const revoke = new RevokeDeveloperCredential(repository);
    await revoke.execute(otherOwner, issued.publicId);
    expect(
      (
        await pool.query(`select revoked_at from developer_credentials where id = $1`, [
          issued.publicId,
        ])
      ).rows[0].revoked_at,
    ).toBeNull();

    await revoke.execute(owner, issued.publicId);
    const first = (
      await pool.query<{ revoked_at: Date }>(
        `select revoked_at from developer_credentials where id = $1`,
        [issued.publicId],
      )
    ).rows[0]!.revoked_at;
    await revoke.execute(owner, issued.publicId);
    const repeated = (
      await pool.query<{ revoked_at: Date }>(
        `select revoked_at from developer_credentials where id = $1`,
        [issued.publicId],
      )
    ).rows[0]!.revoked_at;
    expect(repeated).toEqual(first);

    const otherMetadata = await new ListDeveloperCredentials(repository).execute(otherOwner);
    expect(otherMetadata.some(({ publicId }) => publicId === issued.publicId)).toBe(false);
  });

  it('enforces storage policy and cleans terminal metadata after thirty days', async () => {
    const generated = codec.generate();
    await expect(
      pool.query(
        `insert into developer_credentials
           (id, user_id, secret_hash, display_name, scope, environment, expires_at)
         values ($1, $2, $3, 'Invalid', 'write', 'development', now() + interval '1 day')`,
        [generated.publicId, owner.userId, generated.secretVerifier],
      ),
    ).rejects.toMatchObject({ constraint: 'developer_credentials_scope_check' });
    await expect(
      pool.query(
        `insert into developer_credentials
           (id, user_id, secret_hash, display_name, expires_at)
         values ($1, $2, $3, 'Too long', now() + interval '31 days')`,
        [codec.generate().publicId, owner.userId, codec.generate().secretVerifier],
      ),
    ).rejects.toMatchObject({ constraint: 'developer_credentials_expiry_check' });

    const issued = await new IssueDeveloperCredential(codec, repository).execute(owner, {
      displayName: 'Old credential',
      expiresInDays: 1,
    });
    await pool.query(
      `update developer_credentials set
         created_at = now() - interval '40 days',
         expires_at = now() - interval '39 days',
         revoked_at = now() - interval '31 days'
       where id = $1`,
      [issued.publicId],
    );
    await expect(new CleanupDeveloperCredentials(repository).execute()).resolves.toBe(1);
  });

  it('fails issuance closed for a disabled or missing actor', async () => {
    await pool.query(`update users set status = 'disabled' where id = $1`, [owner.userId]);
    await expect(
      new IssueDeveloperCredential(codec, repository).execute(owner, {
        displayName: 'Disabled',
        expiresInDays: 1,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await pool.query(`update users set status = 'active' where id = $1`, [owner.userId]);
  });

  it('returns a password hash only for the same active actor', async () => {
    const source = new PostgresDeveloperCredentialPasswordSource(database);
    await expect(source.findActivePasswordHash(owner.userId)).resolves.toBe(
      '$argon2id$placeholder',
    );
    await pool.query(`update users set status = 'disabled' where id = $1`, [owner.userId]);
    await expect(source.findActivePasswordHash(owner.userId)).resolves.toBeUndefined();
    await pool.query(`update users set status = 'active' where id = $1`, [owner.userId]);
  });

  it('persists the dedicated issuance rate-limit scopes using hashed identifiers only', async () => {
    const rateLimits = new PostgresAuthenticationRateLimitRepository(database);
    await expect(
      rateLimits.consume({
        scope: 'developer-credential-source',
        keyHash: 'b'.repeat(64),
        windowMilliseconds: 60_000,
        limit: 2,
      }),
    ).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
    await expect(
      rateLimits.consume({
        scope: 'developer-credential-authentication',
        keyHash: 'd'.repeat(64),
        windowMilliseconds: 60_000,
        limit: 2,
      }),
    ).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
    await expect(
      rateLimits.consume({
        scope: 'developer-credential-actor',
        keyHash: 'c'.repeat(64),
        windowMilliseconds: 60_000,
        limit: 2,
      }),
    ).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
    const stored = await pool.query(
      `select scope, key_hash from auth_rate_limits where scope like 'developer-credential-%'`,
    );
    expect(stored.rows).toEqual(
      expect.arrayContaining([
        { scope: 'developer-credential-source', key_hash: 'b'.repeat(64) },
        { scope: 'developer-credential-actor', key_hash: 'c'.repeat(64) },
        { scope: 'developer-credential-authentication', key_hash: 'd'.repeat(64) },
      ]),
    );
  });

  it('resolves on every invocation, throttles last-used writes, and observes revocation immediately', async () => {
    await pool.query(`delete from developer_credentials where user_id = $1`, [owner.userId]);
    const issued = await new IssueDeveloperCredential(codec, repository).execute(owner, {
      displayName: 'Resolver test',
      expiresInDays: 7,
    });
    const resolver = new ResolveDeveloperCredential(
      codec,
      repository,
      {
        consume: async () => undefined,
      },
      'development',
    );

    await expect(resolver.execute(issued.credential)).resolves.toEqual(owner);
    const firstUsed = (
      await pool.query<{ last_used_at: Date }>(
        `select last_used_at from developer_credentials where id = $1`,
        [issued.publicId],
      )
    ).rows[0]!.last_used_at;
    expect(firstUsed).toBeInstanceOf(Date);

    await expect(resolver.execute(issued.credential)).resolves.toEqual(owner);
    const repeatedUsed = (
      await pool.query<{ last_used_at: Date }>(
        `select last_used_at from developer_credentials where id = $1`,
        [issued.publicId],
      )
    ).rows[0]!.last_used_at;
    expect(repeatedUsed).toEqual(firstUsed);

    await new RevokeDeveloperCredential(repository).execute(owner, issued.publicId);
    await expect(resolver.execute(issued.credential)).resolves.toBeUndefined();
  });

  it('fails resolution for an expired credential or disabled owner', async () => {
    await pool.query(`delete from developer_credentials where user_id = $1`, [owner.userId]);
    const issued = await new IssueDeveloperCredential(codec, repository).execute(owner, {
      displayName: 'Expiry test',
      expiresInDays: 1,
    });
    const resolver = new ResolveDeveloperCredential(
      codec,
      repository,
      {
        consume: async () => undefined,
      },
      'development',
    );
    await pool.query(
      `update developer_credentials
       set created_at = now() - interval '2 days', expires_at = now() - interval '1 day'
       where id = $1`,
      [issued.publicId],
    );
    await expect(resolver.execute(issued.credential)).resolves.toBeUndefined();

    const active = await new IssueDeveloperCredential(codec, repository).execute(owner, {
      displayName: 'Disabled owner test',
      expiresInDays: 1,
    });
    await pool.query(`update users set status = 'disabled' where id = $1`, [owner.userId]);
    await expect(resolver.execute(active.credential)).resolves.toBeUndefined();
    await pool.query(`update users set status = 'active' where id = $1`, [owner.userId]);
  });

  async function applyMigration(name: string): Promise<void> {
    const sql = await readFile(
      fileURLToPath(new URL(`../../../drizzle/${name}`, import.meta.url)),
      'utf8',
    );
    await pool.query(sql);
  }
});
