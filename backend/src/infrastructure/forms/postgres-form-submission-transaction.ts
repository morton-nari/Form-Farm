import { and, eq, isNotNull } from 'drizzle-orm';

import type {
  FormSubmissionTransaction,
  FormSubmissionTransactionRequest,
  FormSubmissionTransactionResult,
} from '../../application/ports/form-submission-transaction.js';
import { InvalidFormSubmissionError } from '../../application/forms/submit-form.js';
import type { FormAnswers } from '@form-farm/form-domain';
import type { FormFarmDatabase } from '../database/create-database.js';
import { forms, formSubmissions, formVersions } from '../database/schema.js';

export class PostgresFormSubmissionTransaction implements FormSubmissionTransaction {
  constructor(private readonly database: FormFarmDatabase) {}

  async execute(
    request: FormSubmissionTransactionRequest,
    validate: Parameters<FormSubmissionTransaction['execute']>[1],
  ): Promise<FormSubmissionTransactionResult> {
    try {
      return await this.database.transaction(async (transaction) => {
        const replay = await findIdempotentSubmission(
          transaction,
          request.idempotencyKey,
          request.requestFingerprint,
        );
        if (replay) return replay;

        const [form] = await transaction
          .select({ status: forms.status })
          .from(forms)
          .where(eq(forms.id, request.formId))
          .for('update')
          .limit(1);
        if (!form) return { status: 'not_found' } as const;
        if (form.status === 'draft') return { status: 'not_found' } as const;
        if (form.status !== 'published') return { status: 'not_accepting' } as const;

        const [version] = await transaction
          .select({
            definition: formVersions.definition,
            rowFormId: formVersions.formId,
            rowVersion: formVersions.version,
            rowSchemaVersion: formVersions.schemaVersion,
          })
          .from(formVersions)
          .where(
            and(
              eq(formVersions.formId, request.formId),
              eq(formVersions.version, request.formVersion),
              isNotNull(formVersions.publishedAt),
            ),
          )
          .for('update')
          .limit(1);
        if (!version) return { status: 'not_found' } as const;

        const answers: FormAnswers = validate(version);
        const [created] = await transaction
          .insert(formSubmissions)
          .values({
            formId: request.formId,
            formVersion: request.formVersion,
            answers,
            idempotencyKey: request.idempotencyKey,
            requestFingerprint: request.requestFingerprint,
          })
          .onConflictDoNothing({ target: formSubmissions.idempotencyKey })
          .returning({ submissionId: formSubmissions.id });
        if (created) return { status: 'created', submissionId: created.submissionId } as const;

        return (
          (await findIdempotentSubmission(
            transaction,
            request.idempotencyKey,
            request.requestFingerprint,
          )) ?? { status: 'idempotency_conflict' as const }
        );
      });
    } catch (error) {
      if (error instanceof InvalidFormSubmissionError) throw error;
      throw new FormSubmissionPersistenceError(request.formId);
    }
  }
}

async function findIdempotentSubmission(
  transaction: Parameters<Parameters<FormFarmDatabase['transaction']>[0]>[0],
  idempotencyKey: string,
  requestFingerprint: string,
): Promise<FormSubmissionTransactionResult | undefined> {
  const [existing] = await transaction
    .select({
      submissionId: formSubmissions.id,
      requestFingerprint: formSubmissions.requestFingerprint,
    })
    .from(formSubmissions)
    .where(eq(formSubmissions.idempotencyKey, idempotencyKey))
    .limit(1);
  if (!existing) return undefined;
  return existing.requestFingerprint === requestFingerprint
    ? { status: 'replayed', submissionId: existing.submissionId }
    : { status: 'idempotency_conflict' };
}

export class FormSubmissionPersistenceError extends Error {
  override readonly name = 'FormSubmissionPersistenceError';
  constructor(readonly formId: string) {
    super(`Unable to persist a submission for form "${formId}".`);
  }
}
