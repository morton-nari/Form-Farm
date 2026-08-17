import type { FormDraftDefinition } from '@form-farm/form-domain';

import type { AuthenticatedActor } from './create-form-draft-transaction.js';

export interface StoredOwnerFormDraft {
  readonly definition: unknown;
  readonly rowFormId: string;
  readonly latestVersion: number;
  readonly revision: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type SaveOwnerFormDraftResult =
  | { readonly status: 'saved'; readonly draft: StoredOwnerFormDraft }
  | { readonly status: 'not_found' }
  | { readonly status: 'conflict' }
  | { readonly status: 'invalid_version' };

export interface OwnerFormDraftStore {
  findByIdForOwner(
    formId: string,
    actor: AuthenticatedActor,
  ): Promise<StoredOwnerFormDraft | undefined>;
  save(input: {
    readonly formId: string;
    readonly actor: AuthenticatedActor;
    readonly expectedRevision: number;
    readonly definition: FormDraftDefinition;
  }): Promise<SaveOwnerFormDraftResult>;
}
