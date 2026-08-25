import { describe, expect, it, vi } from 'vitest';

import type {
  DeveloperCredentialAuthenticationRepository,
  DeveloperCredentialAuthenticationThrottle,
  DeveloperCredentialCodec,
  StoredDeveloperCredentialAuthentication,
} from '../ports/developer-credentials.js';
import {
  DEVELOPER_CREDENTIAL_LAST_USED_WRITE_CADENCE_MILLISECONDS,
  ResolveDeveloperCredential,
} from './resolve-developer-credential.js';

describe('ResolveDeveloperCredential', () => {
  it('resolves the minimal actor and confirms active state before returning', async () => {
    const findForAuthentication = vi.fn().mockResolvedValue(stored());
    const confirmActiveAndTouch = vi.fn().mockResolvedValue(true);
    const consume = vi.fn().mockResolvedValue(undefined);
    const resolver = new ResolveDeveloperCredential(
      codec(),
      repository({ findForAuthentication, confirmActiveAndTouch }),
      { consume },
      'development',
      () => new Date('2026-08-24T00:00:00.000Z'),
    );

    await expect(resolver.execute('credential')).resolves.toEqual({ userId: 'owner-1' });
    expect(consume).not.toHaveBeenCalled();
    expect(findForAuthentication).toHaveBeenCalledWith(credentialId);
    expect(confirmActiveAndTouch).toHaveBeenCalledWith({
      publicId: credentialId,
      userId: 'owner-1',
      writeCadenceMilliseconds: DEVELOPER_CREDENTIAL_LAST_USED_WRITE_CADENCE_MILLISECONDS,
    });
  });

  it('rejects malformed input before credential lookup and uses one non-secret limiter identity', async () => {
    const findForAuthentication = vi.fn();
    const consume = vi.fn().mockResolvedValue(undefined);
    const resolver = new ResolveDeveloperCredential(
      codec({ parse: () => undefined }),
      repository({ findForAuthentication }),
      { consume },
      'development',
    );

    await expect(resolver.execute('malformed-secret-value')).resolves.toBeUndefined();
    expect(consume).toHaveBeenCalledWith('malformed');
    expect(findForAuthentication).not.toHaveBeenCalled();
    expect(JSON.stringify(consume.mock.calls)).not.toContain('malformed-secret-value');
  });

  it.each([
    ['unknown public ID', undefined],
    ['wrong scope', stored({ scope: 'write' })],
    ['wrong environment', stored({ environment: 'production' })],
    ['revoked', stored({ revokedAt: new Date('2026-08-23T00:00:00.000Z') })],
    ['expired', stored({ expiresAt: new Date('2026-08-24T00:00:00.000Z') })],
  ])('returns the same unauthenticated result for %s', async (_scenario, record) => {
    const confirmActiveAndTouch = vi.fn();
    const resolver = new ResolveDeveloperCredential(
      codec(),
      repository({ findForAuthentication: async () => record, confirmActiveAndTouch }),
      throttle(),
      'development',
      () => new Date('2026-08-24T00:00:00.000Z'),
    );

    await expect(resolver.execute('credential')).resolves.toBeUndefined();
    expect(confirmActiveAndTouch).not.toHaveBeenCalled();
  });

  it('performs constant-time verifier comparison even when the public ID is unknown', async () => {
    const verifierMatches = vi.fn().mockReturnValue(false);
    const resolver = new ResolveDeveloperCredential(
      codec({ verifierMatches }),
      repository({ findForAuthentication: async () => undefined }),
      throttle(),
      'development',
    );
    await resolver.execute('credential');
    expect(verifierMatches).toHaveBeenCalledWith('0'.repeat(64), 'b'.repeat(64));
  });

  it('fails when the secret is wrong or active state changes before the final boundary', async () => {
    const confirmActiveAndTouch = vi.fn().mockResolvedValue(false);
    const consume = vi.fn().mockResolvedValue(undefined);
    const wrongSecret = new ResolveDeveloperCredential(
      codec({ verifierMatches: () => false }),
      repository({ confirmActiveAndTouch }),
      { consume },
      'development',
    );
    await expect(wrongSecret.execute('credential')).resolves.toBeUndefined();
    expect(confirmActiveAndTouch).not.toHaveBeenCalled();
    expect(consume).toHaveBeenCalledWith(credentialId);

    const revokedDuringResolution = new ResolveDeveloperCredential(
      codec(),
      repository({ confirmActiveAndTouch }),
      { consume },
      'development',
      () => new Date('2026-08-24T00:00:00.000Z'),
    );
    await expect(revokedDuringResolution.execute('credential')).resolves.toBeUndefined();
    expect(confirmActiveAndTouch).toHaveBeenCalledOnce();
  });

  it.each(['preview', 'production'] as const)(
    'does not parse, throttle, or query credentials in %s',
    async (stage) => {
      const parse = vi.fn();
      const findForAuthentication = vi.fn();
      const consume = vi.fn();
      const resolver = new ResolveDeveloperCredential(
        codec({ parse }),
        repository({ findForAuthentication }),
        { consume },
        stage,
      );
      await expect(resolver.execute('credential')).resolves.toBeUndefined();
      expect(parse).not.toHaveBeenCalled();
      expect(findForAuthentication).not.toHaveBeenCalled();
      expect(consume).not.toHaveBeenCalled();
    },
  );
});

const credentialId = '123e4567-e89b-42d3-a456-426614174000';

function stored(
  overrides: Partial<StoredDeveloperCredentialAuthentication> = {},
): StoredDeveloperCredentialAuthentication {
  return {
    publicId: credentialId,
    userId: 'owner-1',
    secretVerifier: 'a'.repeat(64),
    scope: 'form-intelligence:read',
    environment: 'development',
    expiresAt: new Date('2026-08-25T00:00:00.000Z'),
    revokedAt: null,
    ...overrides,
  };
}

function codec(overrides: Partial<DeveloperCredentialCodec> = {}): DeveloperCredentialCodec {
  return {
    generate: () => ({
      publicId: credentialId,
      credential: 'unused',
      secretVerifier: 'a'.repeat(64),
    }),
    parse: () => ({ publicId: credentialId, secretVerifier: 'b'.repeat(64) }),
    verifierMatches: () => true,
    ...overrides,
  };
}

function repository(
  overrides: Partial<DeveloperCredentialAuthenticationRepository> = {},
): DeveloperCredentialAuthenticationRepository {
  return {
    findForAuthentication: async () => stored(),
    confirmActiveAndTouch: async () => true,
    ...overrides,
  };
}

function throttle(): DeveloperCredentialAuthenticationThrottle {
  return { consume: async () => undefined };
}
