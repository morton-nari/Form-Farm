import { and, eq, ne, sql } from 'drizzle-orm';

import type {
  PublishFormDraftResult,
  PublishFormDraftTransaction,
} from '../../application/ports/publish-form-draft-transaction.js';
import type { FormFarmDatabase } from '../database/create-database.js';
import { formDrafts, forms, formVersions } from '../database/schema.js';
import { InvalidStoredFormDefinitionError } from '../../application/forms/get-form-definition.js';

export class PostgresPublishFormDraftTransaction implements PublishFormDraftTransaction {
  constructor(private readonly database: FormFarmDatabase) {}

  async execute(
    input: Parameters<PublishFormDraftTransaction['execute']>[0],
    validate: Parameters<PublishFormDraftTransaction['execute']>[1],
  ): Promise<PublishFormDraftResult> {
    try {
      return await this.database.transaction(async (transaction) => {
        const [lockedForm] = await transaction
          .select({
            rowFormId: forms.id,
            latestVersion: forms.latestVersion,
          })
          .from(forms)
          .where(ownerPredicate(input.formId, input.actor.userId))
          .limit(1)
          .for('update');
        if (!lockedForm) return { status: 'not_found' } as const;
        const [draft] = await transaction
          .select({ definition: formDrafts.definition, revision: formDrafts.revision })
          .from(formDrafts)
          .where(eq(formDrafts.formId, input.formId))
          .limit(1)
          .for('update');
        if (!draft) return { status: 'conflict' } as const;
        const revision = safeRevision(draft.revision);
        if (revision !== input.expectedRevision) return { status: 'conflict' } as const;
        const validated = validate({ ...lockedForm, ...draft, revision });
        if (!validated.success)
          return { status: 'unpublishable', issues: validated.issues } as const;
        const version = lockedForm.latestVersion + 1;
        const [inserted] = await transaction
          .insert(formVersions)
          .values({
            formId: input.formId,
            version,
            schemaVersion: validated.definition.schemaVersion,
            definition: validated.definition,
            publishedAt: sql`now()`,
          })
          .returning({ publishedAt: formVersions.publishedAt });
        const [updated] = await transaction
          .update(forms)
          .set({
            status: 'published',
            latestVersion: version,
            currentPublishedVersion: version,
            updatedAt: sql`now()`,
          })
          .where(ownerPredicate(input.formId, input.actor.userId))
          .returning({ id: forms.id });
        if (!inserted?.publishedAt || !updated) throw new PublishFormDraftPersistenceError();
        const [deleted] = await transaction
          .delete(formDrafts)
          .where(and(eq(formDrafts.formId, input.formId), eq(formDrafts.revision, revision)))
          .returning({ formId: formDrafts.formId });
        if (!deleted) throw new PublishFormDraftPersistenceError();
        return { status: 'published', version, publishedAt: inserted.publishedAt } as const;
      });
    } catch (error) {
      if (error instanceof InvalidStoredFormDefinitionError) throw error;
      throw new PublishFormDraftPersistenceError();
    }
  }
}

function ownerPredicate(formId: string, userId: string) {
  return and(
    eq(forms.id, formId),
    eq(forms.ownershipKind, 'user'),
    eq(forms.ownerUserId, userId),
    ne(forms.status, 'archived'),
  )!;
}

function safeRevision(value: unknown): number {
  const revision = typeof value === 'string' && /^[1-9][0-9]*$/.test(value) ? Number(value) : value;
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1) {
    throw new PublishFormDraftPersistenceError();
  }
  return revision;
}

export class PublishFormDraftPersistenceError extends Error {
  override readonly name = 'PublishFormDraftPersistenceError';
  constructor() {
    super('Unable to publish the form draft.');
  }
}
