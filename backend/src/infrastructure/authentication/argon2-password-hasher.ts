import argon2 from 'argon2';

import type { PasswordHasher } from '../../application/ports/authentication.js';

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export class Argon2PasswordHasher implements PasswordHasher {
  readonly dummyHash =
    '$argon2id$v=19$m=19456,p=1,t=2$p5uTRlpBePT0XyvDmN8FJw$K4d1PpsHupNPg9zKtx0GDUcINaPr2pGvMJDQ9FzmCE8';

  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, ARGON2_OPTIONS);
  }
}
