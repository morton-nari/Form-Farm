import { and, desc, eq, or } from 'drizzle-orm';

import type {
  AccessibleFormRecord,
  AccessibleFormSource,
} from '../../application/ports/accessible-form-source.js';
import type { FormFarmDatabase } from '../database/create-database.js';
import { forms, formVersions } from '../database/schema.js';
import { FormDefinitionPersistenceError } from './postgres-form-definition-source.js';

export class PostgresAccessibleFormSource implements AccessibleFormSource {
  constructor(private readonly database: FormFarmDatabase) {}

  async findPublishedByIdForUser(formId: string, userId: string): Promise<AccessibleFormRecord | undefined> {
    try {
      const rows = await this.baseQuery().where(and(eq(forms.id, formId), access(userId))).limit(1);
      return rows[0];
    } catch {
      throw new FormDefinitionPersistenceError(formId);
    }
  }

  async listPublishedForUser(userId: string): Promise<readonly AccessibleFormRecord[]> {
    try {
      return await this.baseQuery().where(access(userId)).orderBy(desc(forms.updatedAt), forms.id);
    } catch {
      throw new AccessibleFormsPersistenceError();
    }
  }

  private baseQuery() {
    return this.database
      .select({
        definition: formVersions.definition,
        updatedAt: forms.updatedAt,
        rowFormId: formVersions.formId,
        rowVersion: formVersions.version,
        rowSchemaVersion: formVersions.schemaVersion,
      })
      .from(forms)
      .innerJoin(
        formVersions,
        and(eq(formVersions.formId, forms.id), eq(formVersions.version, forms.currentPublishedVersion)),
      );
  }
}

function access(userId: string) {
  return and(
    eq(forms.status, 'published'),
    or(eq(forms.ownershipKind, 'system'), and(eq(forms.ownershipKind, 'user'), eq(forms.ownerUserId, userId))),
  )!;
}

export class AccessibleFormsPersistenceError extends Error {
  override readonly name = 'AccessibleFormsPersistenceError';
  constructor() {
    super('Unable to list accessible forms.');
  }
}
