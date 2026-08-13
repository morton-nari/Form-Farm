import type { SessionCredentialGenerator, SessionRepository } from '../ports/authentication.js';

export class Logout {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly credentials: SessionCredentialGenerator,
  ) {}

  async execute(credential: string): Promise<void> {
    await this.sessions.revoke(this.credentials.hash(credential));
  }
}
