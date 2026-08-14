import type { FormDefinition } from '@form-farm/form-domain';

import type { AuthenticatedActor } from './create-form-draft-transaction.js';

export interface LockedFormDraft {
  readonly definition: unknown;
  readonly rowFormId: string;
  readonly latestVersion: number;
  readonly revision: number;
}

export interface PublishabilityIssue {
  readonly path: readonly (string | number)[];
  readonly code: 'unsupported_field';
}

export type LockedDraftValidation =
  | { readonly success: true; readonly definition: FormDefinition }
  | { readonly success: false; readonly issues: readonly PublishabilityIssue[] };

export type PublishFormDraftResult =
  | { readonly status: 'published'; readonly version: number; readonly publishedAt: Date }
  | { readonly status: 'not_found' }
  | { readonly status: 'conflict' }
  | { readonly status: 'unpublishable'; readonly issues: readonly PublishabilityIssue[] };

export interface PublishFormDraftTransaction {
  execute(
    input: {
      readonly actor: AuthenticatedActor;
      readonly formId: string;
      readonly expectedRevision: number;
    },
    validate: (locked: LockedFormDraft) => LockedDraftValidation,
  ): Promise<PublishFormDraftResult>;
}
