import { createHash, randomBytes } from 'node:crypto';

import type { SessionCredentialGenerator } from '../../application/ports/authentication.js';

export class NodeSessionCredentialGenerator implements SessionCredentialGenerator {
  generate(): { credential: string; credentialHash: string } {
    const credential = randomBytes(32).toString('base64url');
    return { credential, credentialHash: this.hash(credential) };
  }

  hash(credential: string): string {
    return createHash('sha256').update(credential, 'utf8').digest('hex');
  }
}
