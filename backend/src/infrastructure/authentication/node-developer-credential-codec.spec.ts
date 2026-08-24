import { describe, expect, it } from 'vitest';

import { NodeDeveloperCredentialCodec } from './node-developer-credential-codec.js';

describe('NodeDeveloperCredentialCodec', () => {
  const codec = new NodeDeveloperCredentialCodec();

  it('generates independently random, strictly parseable credentials', () => {
    const first = codec.generate();
    const second = codec.generate();

    expect(first.credential).toMatch(
      /^ffmcp_v1\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/,
    );
    expect(first.credential).toHaveLength(89);
    expect(first.secretVerifier).toMatch(/^[0-9a-f]{64}$/);
    expect(codec.parse(first.credential)).toEqual({
      publicId: first.publicId,
      secretVerifier: first.secretVerifier,
    });
    expect(second.publicId).not.toBe(first.publicId);
    expect(second.credential).not.toBe(first.credential);
    expect(second.secretVerifier).not.toBe(first.secretVerifier);
  });

  it.each([
    undefined,
    7,
    '',
    'ffmcp_v2.123e4567-e89b-42d3-a456-426614174000.' + 'a'.repeat(43),
    'ffmcp_v1.123e4567-e89b-12d3-a456-426614174000.' + 'a'.repeat(43),
    'ffmcp_v1.123e4567-e89b-42d3-a456-426614174000.' + 'a'.repeat(42),
    'ffmcp_v1.123e4567-e89b-42d3-a456-426614174000.' + 'a'.repeat(44),
    'ffmcp_v1.123e4567-e89b-42d3-a456-426614174000.' + '!'.repeat(43),
    'ffmcp_v1.123e4567-e89b-42d3-a456-426614174000.' + 'a'.repeat(43) + '.extra',
  ])('rejects malformed credentials before persistence access', (value) => {
    expect(codec.parse(value)).toBeUndefined();
  });

  it('compares only well-formed verifiers', () => {
    expect(codec.verifierMatches('a'.repeat(64), 'a'.repeat(64))).toBe(true);
    expect(codec.verifierMatches('a'.repeat(64), 'b'.repeat(64))).toBe(false);
    expect(codec.verifierMatches('not-a-verifier', 'not-a-verifier')).toBe(false);
  });

  it('does not include raw secret material in the verifier', () => {
    const generated = codec.generate();
    const secret = generated.credential.split('.')[2]!;
    expect(generated.secretVerifier).not.toContain(secret);
    expect(JSON.stringify(codec.parse(generated.credential))).not.toContain(secret);
  });
});
