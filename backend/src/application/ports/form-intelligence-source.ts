import type { AuthenticatedActor } from './create-form-draft-transaction.js';

export interface StoredFormIntelligenceLifecycle {
  readonly formId: string;
  readonly status: 'draft' | 'published' | 'archived';
  readonly latestVersion: number;
  readonly currentPublishedVersion: number | null;
  readonly draftRevision: number | null;
  readonly draftDefinition: unknown | null;
  readonly publishedDefinition: unknown | null;
}

export interface StoredFormIntelligenceVersion {
  readonly formId: string;
  readonly version: number;
  readonly schemaVersion: number;
  readonly definition: unknown;
}

export interface StoredFormIntelligenceDraft {
  readonly formId: string;
  readonly latestVersion: number;
  readonly revision: number;
  readonly definition: unknown;
}

export interface FormIntelligenceSource {
  findLifecycleForOwner(
    actor: AuthenticatedActor,
    formId: string,
  ): Promise<StoredFormIntelligenceLifecycle | undefined>;
  findVersionForOwner(
    actor: AuthenticatedActor,
    formId: string,
    version: number,
  ): Promise<StoredFormIntelligenceVersion | undefined>;
  findDraftForOwner(
    actor: AuthenticatedActor,
    formId: string,
  ): Promise<StoredFormIntelligenceDraft | undefined>;
}
