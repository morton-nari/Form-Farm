import type { FormDefinition } from '@form-farm/form-domain';
import type { AuthenticatedActor } from './create-form-draft-transaction.js';
import type { StoredOwnerFormDraft } from './owner-form-draft-store.js';

export interface LockedPublishedForm {
  readonly definition: unknown;
  readonly rowFormId: string;
  readonly rowVersion: number;
  readonly rowSchemaVersion: number;
  readonly latestVersion: number;
}

export type BootstrapFormDraftResult =
  | { readonly status: 'ready'; readonly created: boolean; readonly draft: StoredOwnerFormDraft }
  | { readonly status: 'not_found' }
  | { readonly status: 'conflict' };

export interface BootstrapFormDraftTransaction {
  execute(
    input: { readonly actor: AuthenticatedActor; readonly formId: string },
    prepare: (locked: LockedPublishedForm) => FormDefinition,
  ): Promise<BootstrapFormDraftResult>;
}
