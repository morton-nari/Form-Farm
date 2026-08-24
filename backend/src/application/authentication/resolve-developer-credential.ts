import type { AuthenticatedActor } from '../ports/create-form-draft-transaction.js';
import type {
  DeveloperCredentialAuthenticationRepository,
  DeveloperCredentialAuthenticationThrottle,
  DeveloperCredentialCodec,
} from '../ports/developer-credentials.js';
import {
  DEVELOPER_CREDENTIAL_ENVIRONMENT,
  DEVELOPER_CREDENTIAL_SCOPE,
} from '../ports/developer-credentials.js';

export const DEVELOPER_CREDENTIAL_LAST_USED_WRITE_CADENCE_MILLISECONDS = 5 * 60_000;
const MISSING_VERIFIER = '0'.repeat(64);
const MALFORMED_RATE_LIMIT_IDENTITY = 'malformed';

export class ResolveDeveloperCredential {
  constructor(
    private readonly codec: DeveloperCredentialCodec,
    private readonly repository: DeveloperCredentialAuthenticationRepository,
    private readonly throttle: DeveloperCredentialAuthenticationThrottle,
    private readonly deploymentStage: 'development' | 'preview' | 'production',
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(credential: unknown): Promise<AuthenticatedActor | undefined> {
    if (this.deploymentStage !== 'development') return undefined;
    const parsed = this.codec.parse(credential);
    if (!parsed) {
      await this.throttle.consume(MALFORMED_RATE_LIMIT_IDENTITY);
      return undefined;
    }

    const stored = await this.repository.findForAuthentication(parsed.publicId);
    const verifierMatches = this.codec.verifierMatches(
      stored?.secretVerifier ?? MISSING_VERIFIER,
      parsed.secretVerifier,
    );
    const valid =
      stored !== undefined &&
      verifierMatches &&
      stored.publicId === parsed.publicId &&
      stored.scope === DEVELOPER_CREDENTIAL_SCOPE &&
      stored.environment === DEVELOPER_CREDENTIAL_ENVIRONMENT &&
      stored.revokedAt === null &&
      stored.expiresAt.getTime() > this.now().getTime();
    if (!valid) {
      await this.throttle.consume(parsed.publicId);
      return undefined;
    }

    const stillActive = await this.repository.confirmActiveAndTouch({
      publicId: stored.publicId,
      userId: stored.userId,
      writeCadenceMilliseconds: DEVELOPER_CREDENTIAL_LAST_USED_WRITE_CADENCE_MILLISECONDS,
    });
    if (!stillActive) {
      await this.throttle.consume(parsed.publicId);
      return undefined;
    }
    return { userId: stored.userId };
  }
}
