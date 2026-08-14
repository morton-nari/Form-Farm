import { and, eq, ne, sql } from 'drizzle-orm';

import type {
  OwnerFormDraftStore,
  SaveOwnerFormDraftResult,
  StoredOwnerFormDraft,
} from '../../application/ports/owner-form-draft-store.js';
import type { FormFarmDatabase } from '../database/create-database.js';
import { formDrafts, forms } from '../database/schema.js';

export class PostgresOwnerFormDraftStore implements OwnerFormDraftStore {
  constructor(private readonly database: FormFarmDatabase) {}

  async findByIdForOwner(
    formId: string,
    actor: Parameters<OwnerFormDraftStore['findByIdForOwner']>[1],
  ): Promise<StoredOwnerFormDraft | undefined> {
    try {
      const rows = await this.baseQuery().where(ownerDraftPredicate(formId, actor.userId)).limit(1);
      return rows[0] ? safeRecord(rows[0]) : undefined;
    } catch {
      throw new OwnerFormDraftPersistenceError();
    }
  }

  async save(input: Parameters<OwnerFormDraftStore['save']>[0]): Promise<SaveOwnerFormDraftResult> {
    try {
      return await this.database.transaction(async (transaction) => {
        const [stored] = await transaction
          .select({
            revision: formDrafts.revision,
            latestVersion: forms.latestVersion,
          })
          .from(forms)
          .innerJoin(formDrafts, eq(formDrafts.formId, forms.id))
          .where(ownerDraftPredicate(input.formId, input.actor.userId))
          .limit(1)
          .for('update');
        if (!stored) return { status: 'not_found' } as const;
        const currentRevision = safeRevision(stored.revision);
        if (currentRevision !== input.expectedRevision) return { status: 'conflict' } as const;
        if (currentRevision === Number.MAX_SAFE_INTEGER) return { status: 'conflict' } as const;
        if (input.definition.formVersion !== stored.latestVersion + 1) {
          return { status: 'invalid_version' } as const;
        }

        const [updated] = await transaction
          .update(formDrafts)
          .set({
            definition: input.definition,
            revision: currentRevision + 1,
            updatedAt: sql`now()`,
          })
          .where(and(eq(formDrafts.formId, input.formId), eq(formDrafts.revision, currentRevision)))
          .returning({
            definition: formDrafts.definition,
            rowFormId: formDrafts.formId,
            revision: formDrafts.revision,
            createdAt: formDrafts.createdAt,
            updatedAt: formDrafts.updatedAt,
          });
        if (!updated) return { status: 'conflict' } as const;
        const [updatedForm] = await transaction
          .update(forms)
          .set({ updatedAt: sql`now()` })
          .where(ownerFormPredicate(input.formId, input.actor.userId))
          .returning({ id: forms.id });
        if (!updatedForm) throw new OwnerFormDraftPersistenceError();
        return {
          status: 'saved',
          draft: safeRecord({ ...updated, latestVersion: stored.latestVersion }),
        } as const;
      });
    } catch {
      throw new OwnerFormDraftPersistenceError();
    }
  }

  private baseQuery() {
    return this.database
      .select({
        definition: formDrafts.definition,
        rowFormId: formDrafts.formId,
        latestVersion: forms.latestVersion,
        revision: formDrafts.revision,
        createdAt: formDrafts.createdAt,
        updatedAt: formDrafts.updatedAt,
      })
      .from(forms)
      .innerJoin(formDrafts, eq(formDrafts.formId, forms.id));
  }
}

function ownerDraftPredicate(formId: string, userId: string) {
  return ownerFormPredicate(formId, userId);
}

function ownerFormPredicate(formId: string, userId: string) {
  return and(
    eq(forms.id, formId),
    eq(forms.ownershipKind, 'user'),
    eq(forms.ownerUserId, userId),
    ne(forms.status, 'archived'),
  )!;
}

function safeRecord(record: {
  definition: unknown;
  rowFormId: string;
  latestVersion: number;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}): StoredOwnerFormDraft {
  return { ...record, revision: safeRevision(record.revision) };
}

function safeRevision(value: unknown): number {
  const revision = typeof value === 'string' && /^[1-9][0-9]*$/.test(value) ? Number(value) : value;
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1) {
    throw new OwnerFormDraftPersistenceError();
  }
  return revision;
}

export class OwnerFormDraftPersistenceError extends Error {
  override readonly name = 'OwnerFormDraftPersistenceError';
  constructor() {
    super('Unable to access the form draft.');
  }
}
