import type { AuthenticatedActor } from './create-form-draft-transaction.js';

export const DEVELOPER_CREDENTIAL_SCOPE = 'form-intelligence:read' as const;
export const DEVELOPER_CREDENTIAL_ENVIRONMENT = 'development' as const;

export interface GeneratedDeveloperCredential {
  readonly publicId: string;
  readonly credential: string;
  readonly secretVerifier: string;
}

export interface ParsedDeveloperCredential {
  readonly publicId: string;
  readonly secretVerifier: string;
}

export interface DeveloperCredentialCodec {
  generate(): GeneratedDeveloperCredential;
  parse(credential: unknown): ParsedDeveloperCredential | undefined;
  verifierMatches(expected: string, presented: string): boolean;
}

export interface DeveloperCredentialMetadata {
  readonly publicId: string;
  readonly displayName: string;
  readonly scope: typeof DEVELOPER_CREDENTIAL_SCOPE;
  readonly environment: typeof DEVELOPER_CREDENTIAL_ENVIRONMENT;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly lastUsedAt: Date | null;
}

export type IssueDeveloperCredentialResult =
  | { readonly status: 'created'; readonly credential: DeveloperCredentialMetadata }
  | { readonly status: 'active_limit_reached' }
  | { readonly status: 'actor_unavailable' };

export interface DeveloperCredentialRepository {
  issue(input: {
    readonly actor: AuthenticatedActor;
    readonly publicId: string;
    readonly secretVerifier: string;
    readonly displayName: string;
    readonly expiresInDays: number;
    readonly maximumActiveCredentials: number;
  }): Promise<IssueDeveloperCredentialResult>;
  listForOwner(actor: AuthenticatedActor): Promise<readonly DeveloperCredentialMetadata[]>;
  revokeForOwner(input: {
    readonly actor: AuthenticatedActor;
    readonly publicId: string;
  }): Promise<void>;
  deleteTerminal(retentionMilliseconds: number): Promise<number>;
}

export interface DeveloperCredentialPasswordSource {
  findActivePasswordHash(userId: string): Promise<string | undefined>;
}

export interface StoredDeveloperCredentialAuthentication {
  readonly publicId: string;
  readonly userId: string;
  readonly secretVerifier: string;
  readonly scope: string;
  readonly environment: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

export interface DeveloperCredentialAuthenticationRepository {
  findForAuthentication(
    publicId: string,
  ): Promise<StoredDeveloperCredentialAuthentication | undefined>;
  confirmActiveAndTouch(input: {
    readonly publicId: string;
    readonly userId: string;
    readonly writeCadenceMilliseconds: number;
  }): Promise<boolean>;
}

export interface DeveloperCredentialAuthenticationThrottle {
  consume(identifier: string): Promise<void>;
}
