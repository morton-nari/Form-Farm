import { count, eq, sql } from 'drizzle-orm';

import type {
  CreateFormDraftTransaction,
  CreateFormDraftTransactionResult,
} from '../../application/ports/create-form-draft-transaction.js';
import type { FormFarmDatabase } from '../database/create-database.js';
import { formDrafts, forms } from '../database/schema.js';

// Reserved for serializing the per-owner form-creation limit. Future advisory-lock
// uses must choose and document a different namespace seed.
const OWNER_FORM_CREATION_LOCK_NAMESPACE = 0;

export class PostgresCreateFormDraftTransaction implements CreateFormDraftTransaction {
  constructor(private readonly database: FormFarmDatabase) {}

  async execute(
    input: Parameters<CreateFormDraftTransaction['execute']>[0],
  ): Promise<CreateFormDraftTransactionResult> {
    try {
      return await this.database.transaction(async (transaction) => {
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${input.actor.userId}, ${OWNER_FORM_CREATION_LOCK_NAMESPACE}))`,
        );
        const [owned] = await transaction
          .select({ value: count() })
          .from(forms)
          .where(eq(forms.ownerUserId, input.actor.userId));
        if ((owned?.value ?? 0) >= input.maximumOwnedForms) {
          return { status: 'owner_limit_reached' } as const;
        }

        const [createdForm] = await transaction
          .insert(forms)
          .values({
            id: input.definition.id,
            status: 'draft',
            latestVersion: 0,
            currentPublishedVersion: null,
            ownerUserId: input.actor.userId,
            ownershipKind: 'user',
          })
          .onConflictDoNothing({ target: forms.id })
          .returning({ id: forms.id, createdAt: forms.createdAt });
        if (!createdForm) return { status: 'conflict' } as const;

        await transaction.insert(formDrafts).values({
          formId: input.definition.id,
          definition: input.definition,
          revision: 1,
        });
        return { status: 'created', createdAt: createdForm.createdAt } as const;
      });
    } catch {
      throw new CreateFormDraftPersistenceError();
    }
  }
}

export class CreateFormDraftPersistenceError extends Error {
  override readonly name = 'CreateFormDraftPersistenceError';
  constructor() {
    super('Unable to create the form draft.');
  }
}
