import type { FormAnswers } from '@form-farm/form-domain';

export interface StoredSubmissionFormVersion {
  readonly rowFormId: string;
  readonly rowVersion: number;
  readonly rowSchemaVersion: number;
  readonly definition: unknown;
}

export interface FormSubmissionTransactionRequest {
  readonly formId: string;
  readonly formVersion: number;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
}

export type FormSubmissionTransactionResult =
  | { readonly status: 'created' | 'replayed'; readonly submissionId: string }
  | { readonly status: 'not_found' }
  | { readonly status: 'not_accepting' }
  | { readonly status: 'idempotency_conflict' };

export interface FormSubmissionTransaction {
  execute(
    request: FormSubmissionTransactionRequest,
    validate: (stored: StoredSubmissionFormVersion) => FormAnswers,
  ): Promise<FormSubmissionTransactionResult>;
}
