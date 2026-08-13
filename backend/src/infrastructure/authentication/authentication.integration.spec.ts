import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { InvalidCredentialsError, Login } from '../../application/authentication/login.js';
import { CleanupSessions } from '../../application/authentication/cleanup-sessions.js';
import { Logout } from '../../application/authentication/logout.js';
import { RegisterAccount } from '../../application/authentication/register-account.js';
import { ResolveSession } from '../../application/authentication/resolve-session.js';
import { createDatabase } from '../database/create-database.js';
import type { FormFarmDatabase } from '../database/create-database.js';
import { Argon2PasswordHasher } from './argon2-password-hasher.js';
import { NodeSessionCredentialGenerator } from './node-session-credential-generator.js';
import { PostgresAuthenticationRateLimitRepository } from './postgres-authentication-rate-limit-repository.js';
import { PostgresSessionRepository } from './postgres-session-repository.js';
import { PostgresUserAccountRepository } from './postgres-user-account-repository.js';

describe('authentication PostgreSQL core', () => {
  let container: StartedTestContainer;
  let pool: Pool;
  let closeDatabase: () => Promise<void>;
  let database: FormFarmDatabase;
  let accounts: PostgresUserAccountRepository;
  let sessions: PostgresSessionRepository;
  const passwords = new Argon2PasswordHasher();
  const credentials = new NodeSessionCredentialGenerator();

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

    await applyMigration('0000_initial_form_read.sql');
    await applyMigration('0001_versioned_form_submissions.sql');
    await pool.query(
      `insert into forms (id, status, latest_version) values ('system-seed', 'draft', 0)`,
    );
    await applyMigration('0002_authentication_ownership_core.sql');

    const databaseContext = createDatabase({
      environment: 'test',
      host: '127.0.0.1',
      port: 3000,
      logLevel: 'silent',
      databaseUrl,
      databasePoolMax: 4,
    });
    database = databaseContext.database;
    closeDatabase = databaseContext.close;
    accounts = new PostgresUserAccountRepository(database);
    sessions = new PostgresSessionRepository(database);
  }, 60_000);

  afterAll(async () => {
    await closeDatabase?.();
    await pool?.end();
    await container?.stop();
  });

  it('backfills system ownership and enforces the exact ownership invariant', async () => {
    await expect(
      pool.query(`select ownership_kind, owner_user_id from forms where id = 'system-seed'`),
    ).resolves.toMatchObject({ rows: [{ ownership_kind: 'system', owner_user_id: null }] });
    await expect(
      pool.query(
        `insert into forms (id, status, ownership_kind) values ('ownerless-user-form', 'draft', 'user')`,
      ),
    ).rejects.toMatchObject({ constraint: 'forms_ownership_check' });

    const owner = await pool.query<{ id: string }>(
      `insert into users (email, normalized_email, password_hash)
       values ('ownership@example.com', 'ownership@example.com', '$argon2id$placeholder')
       returning id`,
    );
    await expect(
      pool.query(
        `insert into forms (id, status, ownership_kind, owner_user_id)
         values ('owned-form', 'draft', 'user', $1)`,
        [owner.rows[0].id],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      pool.query(
        `insert into forms (id, status, ownership_kind, owner_user_id)
         values ('owned-system-form', 'draft', 'system', $1)`,
        [owner.rows[0].id],
      ),
    ).rejects.toMatchObject({ constraint: 'forms_ownership_check' });
    await expect(
      pool.query(
        `insert into forms (id, status, ownership_kind, owner_user_id)
         values ('missing-owner-form', 'draft', 'user', '00000000-0000-4000-8000-000000000000')`,
      ),
    ).rejects.toMatchObject({ constraint: 'forms_owner_user_id_fk' });
  });

  it('creates one account under concurrent normalized registration and stores Argon2id only', async () => {
    const register = new RegisterAccount(accounts, passwords, { contains: () => false });
    await Promise.all([
      register.execute({ email: 'Owner@Example.com', password: 'first exact password value' }),
      register.execute({ email: ' owner@example.COM ', password: 'second exact password value' }),
    ]);

    const stored = await pool.query(
      `select normalized_email, password_hash from users where normalized_email = 'owner@example.com'`,
    );
    expect(stored.rowCount).toBe(1);
    expect(stored.rows[0].password_hash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
    expect(JSON.stringify(stored.rows)).not.toContain('exact password');
  });

  it('creates, resolves, refreshes, disables, and idempotently revokes opaque sessions', async () => {
    const login = new Login(accounts, passwords, credentials, sessions, {
      idleTimeoutMilliseconds: 30 * 60_000,
      absoluteTimeoutMilliseconds: 7 * 24 * 60 * 60_000,
    });
    const { sessionCredential } = await login.execute({
      email: 'owner@example.com',
      password: await storedOwnerPassword(),
    });
    expect(sessionCredential).toHaveLength(43);
    const persisted = await pool.query(`select token_hash from user_sessions`);
    expect(persisted.rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(persisted.rows[0].token_hash).not.toBe(sessionCredential);

    const resolver = new ResolveSession(sessions, credentials, 30 * 60_000, 5 * 60_000);
    await expect(resolver.execute(sessionCredential)).resolves.toMatchObject({
      userId: expect.any(String),
    });

    const beforeCadence = await pool.query<{ last_seen_at: Date }>(
      `select last_seen_at from user_sessions where token_hash = $1`,
      [credentials.hash(sessionCredential)],
    );
    await resolver.execute(sessionCredential);
    const withinCadence = await pool.query<{ last_seen_at: Date }>(
      `select last_seen_at from user_sessions where token_hash = $1`,
      [credentials.hash(sessionCredential)],
    );
    expect(withinCadence.rows[0].last_seen_at).toEqual(beforeCadence.rows[0].last_seen_at);

    await pool.query(
      `update user_sessions set
         created_at = now() - interval '10 minutes',
         last_seen_at = now() - interval '6 minutes'
       where token_hash = $1`,
      [credentials.hash(sessionCredential)],
    );
    await resolver.execute(sessionCredential);
    const afterCadence = await pool.query<{ recently_seen: boolean }>(
      `select last_seen_at > now() - interval '1 minute' as recently_seen
       from user_sessions where token_hash = $1`,
      [credentials.hash(sessionCredential)],
    );
    expect(afterCadence.rows[0].recently_seen).toBe(true);

    await pool.query(
      `update user_sessions set
         created_at = now() - interval '10 minutes',
         last_seen_at = now() - interval '6 minutes',
         absolute_expires_at = now() + interval '1 minute',
         idle_expires_at = now() + interval '1 minute'
       where token_hash = $1`,
      [credentials.hash(sessionCredential)],
    );
    await resolver.execute(sessionCredential);
    const boundedExpiry = await pool.query<{ idle_is_bounded: boolean }>(
      `select idle_expires_at = absolute_expires_at as idle_is_bounded
       from user_sessions where token_hash = $1`,
      [credentials.hash(sessionCredential)],
    );
    expect(boundedExpiry.rows[0].idle_is_bounded).toBe(true);
    await expect(
      pool.query(
        `update user_sessions set idle_expires_at = absolute_expires_at + interval '1 second'
         where token_hash = $1`,
        [credentials.hash(sessionCredential)],
      ),
    ).rejects.toMatchObject({ constraint: 'user_sessions_expiry_check' });

    await pool.query(`update user_sessions set idle_expires_at = now() where token_hash = $1`, [
      credentials.hash(sessionCredential),
    ]);
    await expect(resolver.execute(sessionCredential)).resolves.toBeUndefined();
    await pool.query(
      `update user_sessions set
         idle_expires_at = now() + interval '30 minutes',
         absolute_expires_at = now() + interval '7 days'
       where token_hash = $1`,
      [credentials.hash(sessionCredential)],
    );

    await pool.query(
      `update users set status = 'disabled' where normalized_email = 'owner@example.com'`,
    );
    await expect(resolver.execute(sessionCredential)).resolves.toBeUndefined();
    await pool.query(
      `update users set status = 'active' where normalized_email = 'owner@example.com'`,
    );

    const logout = new Logout(sessions, credentials);
    await logout.execute(sessionCredential);
    const firstRevocation = await pool.query<{ revoked_at: Date }>(
      `select revoked_at from user_sessions where token_hash = $1`,
      [credentials.hash(sessionCredential)],
    );
    await logout.execute(sessionCredential);
    const repeatedRevocation = await pool.query<{ revoked_at: Date }>(
      `select revoked_at from user_sessions where token_hash = $1`,
      [credentials.hash(sessionCredential)],
    );
    expect(repeatedRevocation.rows[0].revoked_at).toEqual(firstRevocation.rows[0].revoked_at);
    await expect(resolver.execute(sessionCredential)).resolves.toBeUndefined();

    await pool.query(
      `update user_sessions set
         created_at = now() - interval '40 days',
         last_seen_at = now() - interval '40 days',
         idle_expires_at = now() - interval '39 days',
         absolute_expires_at = now() - interval '39 days',
         revoked_at = now() - interval '31 days'
       where token_hash = $1`,
      [credentials.hash(sessionCredential)],
    );
    await expect(new CleanupSessions(sessions, 30 * 24 * 60 * 60_000).execute()).resolves.toBe(1);
  });

  it('preserves exact password code points across registration and login', async () => {
    const register = new RegisterAccount(accounts, passwords, { contains: () => false });
    const decomposedPassword = `an exact cafe\u0301 password`;
    const composedPassword = `an exact caf\u00e9 password`;
    await register.execute({ email: 'unicode@example.com', password: decomposedPassword });
    const login = new Login(accounts, passwords, credentials, sessions, {
      idleTimeoutMilliseconds: 30 * 60_000,
      absoluteTimeoutMilliseconds: 7 * 24 * 60 * 60_000,
    });

    await expect(
      login.execute({ email: 'unicode@example.com', password: composedPassword }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(
      login.execute({ email: 'unicode@example.com', password: decomposedPassword }),
    ).resolves.toMatchObject({ sessionCredential: expect.any(String) });
  });

  it('increments one durable rate-limit bucket atomically and resets expired windows', async () => {
    const limiter = new PostgresAuthenticationRateLimitRepository(database);
    const requests = Array.from({ length: 4 }, () =>
      limiter.consume({
        scope: 'login-account',
        keyHash: 'a'.repeat(64),
        windowMilliseconds: 60_000,
        limit: 3,
      }),
    );
    const results = await Promise.all(requests);
    expect(results.filter((result) => result.allowed)).toHaveLength(3);
    expect(results.filter((result) => !result.allowed)).toHaveLength(1);
    await pool.query(
      `update auth_rate_limits set window_started_at = now() - interval '61 seconds'
       where scope = 'login-account' and key_hash = $1`,
      ['a'.repeat(64)],
    );
    await expect(
      limiter.consume({
        scope: 'login-account',
        keyHash: 'a'.repeat(64),
        windowMilliseconds: 60_000,
        limit: 3,
      }),
    ).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
    await expect(
      pool.query(
        `insert into auth_rate_limits (scope, key_hash, window_started_at, attempt_count)
         values ('request-controlled-scope', $1, now(), 1)`,
        ['b'.repeat(64)],
      ),
    ).rejects.toMatchObject({ constraint: 'auth_rate_limits_scope_check' });
  });

  async function applyMigration(name: string): Promise<void> {
    const migration = await readFile(
      fileURLToPath(new URL(`../../../drizzle/${name}`, import.meta.url)),
      'utf8',
    );
    await pool.query(migration);
  }

  async function storedOwnerPassword(): Promise<string> {
    for (const candidate of ['first exact password value', 'second exact password value']) {
      const account = await accounts.findByNormalizedEmail('owner@example.com');
      if (account && (await passwords.verify(account.passwordHash, candidate))) return candidate;
    }
    throw new Error('Expected one concurrent registration password to verify.');
  }
});
