import { ApplicationError } from '../errors/application-error.js';
import type { AuthenticatedActor } from '../ports/create-form-draft-transaction.js';
import type {
  DeveloperCredentialCodec,
  DeveloperCredentialMetadata,
  DeveloperCredentialPasswordSource,
  DeveloperCredentialRepository,
} from '../ports/developer-credentials.js';
import type { PasswordHasher } from '../ports/authentication.js';

export const MINIMUM_DEVELOPER_CREDENTIAL_EXPIRY_DAYS = 1;
export const MAXIMUM_DEVELOPER_CREDENTIAL_EXPIRY_DAYS = 30;
export const MAXIMUM_ACTIVE_DEVELOPER_CREDENTIALS = 5;
export const DEVELOPER_CREDENTIAL_TERMINAL_RETENTION_MILLISECONDS = 30 * 24 * 60 * 60_000;
const MAXIMUM_DISPLAY_NAME_LENGTH = 80;

export interface IssuedDeveloperCredential extends DeveloperCredentialMetadata {
  /** Returned once. Callers must never persist or log this value. */
  readonly credential: string;
}

export class IssueDeveloperCredential {
  constructor(
    private readonly credentials: DeveloperCredentialCodec,
    private readonly repository: DeveloperCredentialRepository,
  ) {}

  async execute(
    actor: AuthenticatedActor,
    input: { readonly displayName: unknown; readonly expiresInDays: unknown },
  ): Promise<IssuedDeveloperCredential> {
    const displayName = validateDisplayName(input.displayName);
    const expiresInDays = validateExpiryDays(input.expiresInDays);
    const generated = this.credentials.generate();
    const result = await this.repository.issue({
      actor,
      publicId: generated.publicId,
      secretVerifier: generated.secretVerifier,
      displayName,
      expiresInDays,
      maximumActiveCredentials: MAXIMUM_ACTIVE_DEVELOPER_CREDENTIALS,
    });
    if (result.status === 'active_limit_reached') {
      throw new ApplicationError(
        'conflict',
        'The active developer credential limit has been reached.',
      );
    }
    if (result.status === 'actor_unavailable') {
      throw new ApplicationError('not_found', 'The account is unavailable.');
    }
    return { ...result.credential, credential: generated.credential };
  }
}

export class ConfirmAndIssueDeveloperCredential {
  constructor(
    private readonly passwords: PasswordHasher,
    private readonly passwordSource: DeveloperCredentialPasswordSource,
    private readonly issueCredential: IssueDeveloperCredential,
  ) {}

  async execute(
    actor: AuthenticatedActor,
    input: {
      readonly currentPassword: unknown;
      readonly displayName: unknown;
      readonly expiresInDays: unknown;
    },
    revalidateSession: () => Promise<AuthenticatedActor | undefined>,
  ): Promise<IssuedDeveloperCredential> {
    const currentPassword = validateCurrentPassword(input.currentPassword);
    const passwordHash = await this.passwordSource.findActivePasswordHash(actor.userId);
    const valid = await this.passwords.verify(
      passwordHash ?? this.passwords.dummyHash,
      currentPassword,
    );
    if (!passwordHash || !valid) throw new InvalidDeveloperCredentialConfirmationError();

    const revalidated = await revalidateSession();
    if (!revalidated || revalidated.userId !== actor.userId) {
      throw new InvalidDeveloperCredentialConfirmationError();
    }
    return this.issueCredential.execute(actor, input);
  }
}

export class InvalidDeveloperCredentialConfirmationError extends Error {
  override readonly name = 'InvalidDeveloperCredentialConfirmationError';

  constructor() {
    super('The credential could not be issued.');
  }
}

export class ListDeveloperCredentials {
  constructor(private readonly repository: DeveloperCredentialRepository) {}

  execute(actor: AuthenticatedActor): Promise<readonly DeveloperCredentialMetadata[]> {
    return this.repository.listForOwner(actor);
  }
}

export class RevokeDeveloperCredential {
  constructor(private readonly repository: DeveloperCredentialRepository) {}

  async execute(actor: AuthenticatedActor, publicId: unknown): Promise<void> {
    if (typeof publicId !== 'string' || !isUuid(publicId)) {
      throw new ApplicationError(
        'invalid_input',
        'The developer credential identifier is invalid.',
      );
    }
    await this.repository.revokeForOwner({ actor, publicId });
  }
}

export class CleanupDeveloperCredentials {
  constructor(private readonly repository: DeveloperCredentialRepository) {}

  execute(): Promise<number> {
    return this.repository.deleteTerminal(DEVELOPER_CREDENTIAL_TERMINAL_RETENTION_MILLISECONDS);
  }
}

function validateDisplayName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ApplicationError('invalid_input', 'The developer credential name is invalid.');
  }
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > MAXIMUM_DISPLAY_NAME_LENGTH) {
    throw new ApplicationError('invalid_input', 'The developer credential name is invalid.');
  }
  return normalized;
}

function validateExpiryDays(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < MINIMUM_DEVELOPER_CREDENTIAL_EXPIRY_DAYS ||
    value > MAXIMUM_DEVELOPER_CREDENTIAL_EXPIRY_DAYS
  ) {
    throw new ApplicationError('invalid_input', 'The developer credential expiry is invalid.');
  }
  return value;
}

function validateCurrentPassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 16_384) {
    throw new InvalidDeveloperCredentialConfirmationError();
  }
  return value;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
