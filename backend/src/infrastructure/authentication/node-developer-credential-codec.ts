import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

import type {
  DeveloperCredentialCodec,
  GeneratedDeveloperCredential,
  ParsedDeveloperCredential,
} from '../../application/ports/developer-credentials.js';

const PREFIX = 'ffmcp_v1';
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CREDENTIAL_PATTERN = new RegExp(
  `^${PREFIX}\\.(${UUID_PATTERN.source.slice(1, -1)})\\.([A-Za-z0-9_-]{43})$`,
);

export class NodeDeveloperCredentialCodec implements DeveloperCredentialCodec {
  generate(): GeneratedDeveloperCredential {
    const publicId = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    return {
      publicId,
      credential: `${PREFIX}.${publicId}.${secret}`,
      secretVerifier: verifier(secret),
    };
  }

  parse(credential: unknown): ParsedDeveloperCredential | undefined {
    if (typeof credential !== 'string' || credential.length !== 89) return undefined;
    const match = CREDENTIAL_PATTERN.exec(credential);
    const publicId = match?.[1];
    const secret = match?.[2];
    if (!publicId || !secret || !SECRET_PATTERN.test(secret)) return undefined;
    return { publicId, secretVerifier: verifier(secret) };
  }

  verifierMatches(expected: string, presented: string): boolean {
    if (!VERIFIER_PATTERN.test(expected) || !VERIFIER_PATTERN.test(presented)) return false;
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(presented, 'hex'));
  }
}

function verifier(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}
