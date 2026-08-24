import { describe, expect, it, vi } from 'vitest';

import { ApplicationError } from '../errors/application-error.js';
import type {
  DeveloperCredentialCodec,
  DeveloperCredentialPasswordSource,
  DeveloperCredentialRepository,
} from '../ports/developer-credentials.js';
import type { PasswordHasher } from '../ports/authentication.js';
import {
  CleanupDeveloperCredentials,
  ConfirmAndIssueDeveloperCredential,
  DEVELOPER_CREDENTIAL_TERMINAL_RETENTION_MILLISECONDS,
  IssueDeveloperCredential,
  ListDeveloperCredentials,
  MAXIMUM_ACTIVE_DEVELOPER_CREDENTIALS,
  RevokeDeveloperCredential,
} from './developer-credentials.js';

describe('developer credential application use cases', () => {
  it('issues one raw credential while persisting only its verifier and fixed policy', async () => {
    const issue = vi.fn<DeveloperCredentialRepository['issue']>().mockResolvedValue({
      status: 'created',
      credential: metadata(),
    });
    const useCase = new IssueDeveloperCredential(codec(), repository({ issue }));

    await expect(
      useCase.execute({ userId: 'owner-1' }, { displayName: '  VS Code  ', expiresInDays: 7 }),
    ).resolves.toEqual({ ...metadata(), credential: 'raw-secret-credential' });
    expect(issue).toHaveBeenCalledWith({
      actor: { userId: 'owner-1' },
      publicId: credentialId,
      secretVerifier: 'a'.repeat(64),
      displayName: 'VS Code',
      expiresInDays: 7,
      maximumActiveCredentials: MAXIMUM_ACTIVE_DEVELOPER_CREDENTIALS,
    });
    expect(JSON.stringify(issue.mock.calls)).not.toContain('raw-secret-credential');
  });

  it('confirms the current password and same active session before generating a credential', async () => {
    const generate = vi.fn(codec().generate);
    const issue = vi.fn<DeveloperCredentialRepository['issue']>().mockResolvedValue({
      status: 'created',
      credential: metadata(),
    });
    const verify = vi.fn().mockResolvedValue(true);
    const revalidate = vi.fn().mockResolvedValue({ userId: 'owner-1' });
    const useCase = new ConfirmAndIssueDeveloperCredential(
      passwordHasher({ verify }),
      passwordSource('stored-password-hash'),
      new IssueDeveloperCredential({ ...codec(), generate }, repository({ issue })),
    );

    await expect(
      useCase.execute(
        { userId: 'owner-1' },
        { displayName: 'CLI', expiresInDays: 7, currentPassword: 'request-only-password' },
        revalidate,
      ),
    ).resolves.toMatchObject({ credential: 'raw-secret-credential' });
    expect(verify).toHaveBeenCalledWith('stored-password-hash', 'request-only-password');
    expect(revalidate).toHaveBeenCalledOnce();
    expect(generate).toHaveBeenCalledOnce();
    expect(JSON.stringify(issue.mock.calls)).not.toContain('request-only-password');
  });

  it.each([
    ['wrong password', 'owner-1'],
    ['missing active account', 'owner-1'],
    ['expired session', undefined],
    ['different session actor', 'owner-2'],
  ])(
    'fails issuance safely for %s without generating a secret',
    async (scenario, resolvedUserId) => {
      const generate = vi.fn(codec().generate);
      const passwordHash = scenario === 'missing active account' ? undefined : 'stored-hash';
      const verify = vi.fn().mockResolvedValue(scenario !== 'wrong password');
      const useCase = new ConfirmAndIssueDeveloperCredential(
        passwordHasher({ verify }),
        passwordSource(passwordHash),
        new IssueDeveloperCredential({ ...codec(), generate }, repository()),
      );

      await expect(
        useCase.execute(
          { userId: 'owner-1' },
          { displayName: 'CLI', expiresInDays: 7, currentPassword: 'password' },
          async () => (resolvedUserId ? { userId: resolvedUserId } : undefined),
        ),
      ).rejects.toMatchObject({ name: 'InvalidDeveloperCredentialConfirmationError' });
      expect(generate).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{ displayName: '', expiresInDays: 1 }],
    [{ displayName: 'x'.repeat(81), expiresInDays: 1 }],
    [{ displayName: 'valid', expiresInDays: 0 }],
    [{ displayName: 'valid', expiresInDays: 31 }],
    [{ displayName: 'valid', expiresInDays: 1.5 }],
    [{ displayName: 7, expiresInDays: 7 }],
  ])('rejects invalid issuance policy before persistence', async (input) => {
    const issue = vi.fn<DeveloperCredentialRepository['issue']>();
    await expect(
      new IssueDeveloperCredential(codec(), repository({ issue })).execute(
        { userId: 'owner-1' },
        input,
      ),
    ).rejects.toMatchObject({ name: 'ApplicationError', code: 'invalid_input' });
    expect(issue).not.toHaveBeenCalled();
  });

  it.each([
    ['active_limit_reached', 'conflict'],
    ['actor_unavailable', 'not_found'],
  ] as const)('maps repository status %s safely', async (status, code) => {
    const issue = vi.fn<DeveloperCredentialRepository['issue']>().mockResolvedValue({ status });
    await expect(
      new IssueDeveloperCredential(codec(), repository({ issue })).execute(
        { userId: 'owner-1' },
        { displayName: 'Codex', expiresInDays: 1 },
      ),
    ).rejects.toMatchObject({ name: 'ApplicationError', code });
  });

  it('lists safe owner metadata and revokes only a valid public identifier', async () => {
    const listForOwner = vi
      .fn<DeveloperCredentialRepository['listForOwner']>()
      .mockResolvedValue([metadata()]);
    const revokeForOwner = vi.fn<DeveloperCredentialRepository['revokeForOwner']>();
    const store = repository({ listForOwner, revokeForOwner });

    await expect(
      new ListDeveloperCredentials(store).execute({ userId: 'owner-1' }),
    ).resolves.toEqual([metadata()]);
    await new RevokeDeveloperCredential(store).execute({ userId: 'owner-1' }, credentialId);
    expect(revokeForOwner).toHaveBeenCalledWith({
      actor: { userId: 'owner-1' },
      publicId: credentialId,
    });
    await expect(
      new RevokeDeveloperCredential(store).execute({ userId: 'owner-1' }, '../credential'),
    ).rejects.toBeInstanceOf(ApplicationError);
  });

  it('uses the explicit terminal-metadata retention policy', async () => {
    const deleteTerminal = vi
      .fn<DeveloperCredentialRepository['deleteTerminal']>()
      .mockResolvedValue(2);
    await expect(
      new CleanupDeveloperCredentials(repository({ deleteTerminal })).execute(),
    ).resolves.toBe(2);
    expect(deleteTerminal).toHaveBeenCalledWith(
      DEVELOPER_CREDENTIAL_TERMINAL_RETENTION_MILLISECONDS,
    );
  });
});

const credentialId = '123e4567-e89b-42d3-a456-426614174000';

function metadata() {
  return {
    publicId: credentialId,
    displayName: 'VS Code',
    scope: 'form-intelligence:read' as const,
    environment: 'development' as const,
    createdAt: new Date('2026-08-24T00:00:00.000Z'),
    expiresAt: new Date('2026-08-31T00:00:00.000Z'),
    revokedAt: null,
    lastUsedAt: null,
  };
}

function passwordSource(passwordHash: string | undefined): DeveloperCredentialPasswordSource {
  return { findActivePasswordHash: async () => passwordHash };
}

function passwordHasher(overrides: Partial<PasswordHasher> = {}): PasswordHasher {
  return {
    hash: async () => 'hash',
    verify: async () => false,
    needsRehash: () => false,
    dummyHash: 'dummy-hash',
    ...overrides,
  };
}

function codec(): DeveloperCredentialCodec {
  return {
    generate: () => ({
      publicId: credentialId,
      credential: 'raw-secret-credential',
      secretVerifier: 'a'.repeat(64),
    }),
    parse: () => undefined,
    verifierMatches: () => false,
  };
}

function repository(
  overrides: Partial<DeveloperCredentialRepository> = {},
): DeveloperCredentialRepository {
  return {
    issue: async () => ({ status: 'actor_unavailable' }),
    listForOwner: async () => [],
    revokeForOwner: async () => undefined,
    deleteTerminal: async () => 0,
    ...overrides,
  };
}
