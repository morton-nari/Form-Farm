import { and, desc, eq, lt, or, gt, sql } from 'drizzle-orm';
import type { OwnerFormManagementSource } from '../../application/ports/owner-form-management-source.js';
import type { FormFarmDatabase } from '../database/create-database.js';
import { formDrafts, forms, formVersions } from '../database/schema.js';

export class PostgresOwnerFormManagementSource implements OwnerFormManagementSource {
  constructor(private readonly database: FormFarmDatabase) {}
  async list(input: Parameters<OwnerFormManagementSource['list']>[0]) {
    try {
      const cursor = input.cursor
        ? or(
            lt(forms.updatedAt, input.cursor.updatedAt),
            and(eq(forms.updatedAt, input.cursor.updatedAt), gt(forms.id, input.cursor.formId)),
          )
        : undefined;
      return await this.database
        .select({
          definition: sql<unknown>`coalesce(${formDrafts.definition}, ${formVersions.definition})`,
          rowFormId: forms.id,
          status: sql<'draft' | 'published' | 'archived'>`${forms.status}`,
          latestVersion: forms.latestVersion,
          currentPublishedVersion: forms.currentPublishedVersion,
          draftRevision: formDrafts.revision,
          definitionVersion: sql<number>`case when ${formDrafts.formId} is not null then ${forms.latestVersion} + 1 else ${formVersions.version} end`,
          updatedAt: forms.updatedAt,
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
        .where(and(eq(forms.ownershipKind, 'user'), eq(forms.ownerUserId, input.userId), cursor))
        .orderBy(desc(forms.updatedAt), forms.id)
        .limit(input.limit);
    } catch {
      throw new OwnerFormManagementPersistenceError();
    }
  }
}

export class OwnerFormManagementPersistenceError extends Error {
  override readonly name = 'OwnerFormManagementPersistenceError';
  constructor() {
    super('Unable to list managed forms.');
  }
}
