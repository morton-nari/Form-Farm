import { and, eq } from 'drizzle-orm';
import type {
  BootstrapFormDraftResult,
  BootstrapFormDraftTransaction,
} from '../../application/ports/bootstrap-form-draft-transaction.js';
import { InvalidStoredFormDefinitionError } from '../../application/forms/get-form-definition.js';
import type { FormFarmDatabase } from '../database/create-database.js';
import { formDrafts, forms, formVersions } from '../database/schema.js';

export class PostgresBootstrapFormDraftTransaction implements BootstrapFormDraftTransaction {
  constructor(private readonly database: FormFarmDatabase) {}
  async execute(
    input: Parameters<BootstrapFormDraftTransaction['execute']>[0],
    prepare: Parameters<BootstrapFormDraftTransaction['execute']>[1],
  ): Promise<BootstrapFormDraftResult> {
    try {
      return await this.database.transaction(async (tx) => {
        const [form] = await tx
          .select({
            latestVersion: forms.latestVersion,
            currentVersion: forms.currentPublishedVersion,
          })
          .from(forms)
          .where(
            and(
              eq(forms.id, input.formId),
              eq(forms.ownerUserId, input.actor.userId),
              eq(forms.ownershipKind, 'user'),
              eq(forms.status, 'published'),
            ),
          )
          .limit(1)
          .for('update');
        if (!form || form.currentVersion === null) return { status: 'not_found' } as const;
        const existing = await findDraft(tx, input.formId, form.latestVersion);
        if (existing) return { status: 'ready', created: false, draft: existing } as const;
        const [published] = await tx
          .select({
            definition: formVersions.definition,
            rowFormId: formVersions.formId,
            rowVersion: formVersions.version,
            rowSchemaVersion: formVersions.schemaVersion,
          })
          .from(formVersions)
          .where(
            and(
              eq(formVersions.formId, input.formId),
              eq(formVersions.version, form.currentVersion),
            ),
          )
          .limit(1);
        if (!published) throw new BootstrapFormDraftPersistenceError();
        const definition = prepare({ ...published, latestVersion: form.latestVersion });
        await tx.insert(formDrafts).values({ formId: input.formId, definition, revision: 1 });
        const created = await findDraft(tx, input.formId, form.latestVersion);
        if (!created) throw new BootstrapFormDraftPersistenceError();
        return { status: 'ready', created: true, draft: created } as const;
      });
    } catch (error) {
      if (error instanceof InvalidStoredFormDefinitionError) throw error;
      throw new BootstrapFormDraftPersistenceError();
    }
  }
}

async function findDraft(
  tx: Pick<FormFarmDatabase, 'select'>,
  formId: string,
  latestVersion: number,
) {
  const [draft] = await tx
    .select({
      definition: formDrafts.definition,
      rowFormId: formDrafts.formId,
      revision: formDrafts.revision,
      createdAt: formDrafts.createdAt,
      updatedAt: formDrafts.updatedAt,
    })
    .from(formDrafts)
    .where(eq(formDrafts.formId, formId))
    .limit(1);
  return draft ? { ...draft, latestVersion } : undefined;
}

export class BootstrapFormDraftPersistenceError extends Error {
  override readonly name = 'BootstrapFormDraftPersistenceError';
  constructor() {
    super('Unable to start editing the form.');
  }
}
