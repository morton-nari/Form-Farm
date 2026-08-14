import type { FormDefinition } from '@form-farm/form-domain';

export interface AuthenticatedActor {
  readonly userId: string;
}

export type CreateFormDraftTransactionResult =
  | { readonly status: 'created'; readonly createdAt: Date }
  | { readonly status: 'conflict' }
  | { readonly status: 'owner_limit_reached' };

export interface CreateFormDraftTransaction {
  execute(input: {
    readonly actor: AuthenticatedActor;
    readonly definition: FormDefinition;
    readonly maximumOwnedForms: number;
  }): Promise<CreateFormDraftTransactionResult>;
}
