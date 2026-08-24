import { and, eq } from 'drizzle-orm';

import type { AuthenticatedActor } from '../../application/ports/create-form-draft-transaction.js';
import type {
  FormIntelligenceSource,
  StoredFormIntelligenceDraft,
  StoredFormIntelligenceLifecycle,
  StoredFormIntelligenceVersion,
} from '../../application/ports/form-intelligence-source.js';
import type { FormFarmDatabase } from '../database/create-database.js';
import { formDrafts, forms, formVersions } from '../database/schema.js';
import { FormDefinitionPersistenceError } from './postgres-form-definition-source.js';

export class PostgresFormIntelligenceSource implements FormIntelligenceSource {
  constructor(private readonly database: FormFarmDatabase) {}

  async findLifecycleForOwner(
    actor: AuthenticatedActor,
    formId: string,
  ): Promise<StoredFormIntelligenceLifecycle | undefined> {
    try {
      const rows = await this.database
        .select({
          formId: forms.id,
          status: forms.status,
          latestVersion: forms.latestVersion,
          currentPublishedVersion: forms.currentPublishedVersion,
          draftRevision: formDrafts.revision,
          draftDefinition: formDrafts.definition,
          publishedDefinition: formVersions.definition,
        })
        .from(forms)
        .leftJoin(formDrafts, eq(formDrafts.formId, forms.id))
        .leftJoin(
          formVersions,
          and(
            eq(formVersions.formId, forms.id),
            eq(formVersions.version, forms.currentPublishedVersion),
          ),
        )
        .where(ownerAccess(actor, formId))
        .limit(1);
      const row = rows[0];
      if (!row || !isStatus(row.status)) return undefined;
      return { ...row, status: row.status };
    } catch {
      throw new FormDefinitionPersistenceError(formId);
    }
  }

  async findVersionForOwner(
    actor: AuthenticatedActor,
    formId: string,
    version: number,
  ): Promise<StoredFormIntelligenceVersion | undefined> {
    try {
      const rows = await this.database
        .select({
          formId: formVersions.formId,
          version: formVersions.version,
          schemaVersion: formVersions.schemaVersion,
          definition: formVersions.definition,
        })
        .from(forms)
        .innerJoin(formVersions, eq(formVersions.formId, forms.id))
        .where(and(ownerAccess(actor, formId), eq(formVersions.version, version)))
        .limit(1);
      return rows[0];
    } catch {
      throw new FormDefinitionPersistenceError(formId);
    }
  }

  async findDraftForOwner(
    actor: AuthenticatedActor,
    formId: string,
  ): Promise<StoredFormIntelligenceDraft | undefined> {
    try {
      const rows = await this.database
        .select({
          formId: forms.id,
          latestVersion: forms.latestVersion,
          revision: formDrafts.revision,
          definition: formDrafts.definition,
        })
        .from(forms)
        .innerJoin(formDrafts, eq(formDrafts.formId, forms.id))
        .where(ownerAccess(actor, formId))
        .limit(1);
      return rows[0];
    } catch {
      throw new FormDefinitionPersistenceError(formId);
    }
  }
}

function ownerAccess(actor: AuthenticatedActor, formId: string) {
  return and(
    eq(forms.id, formId),
    eq(forms.ownershipKind, 'user'),
    eq(forms.ownerUserId, actor.userId),
  )!;
}

function isStatus(value: string): value is StoredFormIntelligenceLifecycle['status'] {
  return value === 'draft' || value === 'published' || value === 'archived';
}
