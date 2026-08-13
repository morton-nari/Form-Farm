import type { SessionRepository } from '../ports/authentication.js';

export class CleanupSessions {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly retentionMilliseconds: number,
  ) {}

  execute(): Promise<number> {
    return this.sessions.deleteExpired(this.retentionMilliseconds);
  }
}
