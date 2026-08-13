import type { SessionCredentialGenerator, SessionRepository } from '../ports/authentication.js';

export class ResolveSession {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly credentials: SessionCredentialGenerator,
    private readonly idleTimeoutMilliseconds: number,
    private readonly activityWriteCadenceMilliseconds: number,
  ) {}

  async execute(credential: string): Promise<{ readonly userId: string } | undefined> {
    const resolved = await this.sessions.resolve({
      credentialHash: this.credentials.hash(credential),
      idleTimeoutMilliseconds: this.idleTimeoutMilliseconds,
      activityWriteCadenceMilliseconds: this.activityWriteCadenceMilliseconds,
    });
    return resolved ? { userId: resolved.userId } : undefined;
  }
}
