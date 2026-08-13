import { and, eq } from 'drizzle-orm';
import { validateFormDefinition } from '@form-farm/form-domain';

import type { FormDefinitionSource } from '../../application/ports/form-definition-source.js';
import type { FormFarmDatabase } from '../database/create-database.js';
import { forms, formVersions } from '../database/schema.js';

export class PostgresFormDefinitionSource implements FormDefinitionSource {
  constructor(private readonly database: FormFarmDatabase) {}

  async findById(formId: string): Promise<unknown | undefined> {
    let rows;
    try {
      rows = await this.database
        .select({
          definition: formVersions.definition,
          rowFormId: formVersions.formId,
          rowVersion: formVersions.version,
          rowSchemaVersion: formVersions.schemaVersion,
        })
        .from(forms)
        .innerJoin(
          formVersions,
          and(
            eq(formVersions.formId, forms.id),
            eq(formVersions.version, forms.currentPublishedVersion),
          ),
        )
        .where(eq(forms.id, formId))
        .limit(1);
    } catch {
      throw new FormDefinitionPersistenceError(formId);
    }

    const row = rows[0];
    if (!row) return undefined;

    const validation = validateFormDefinition(row.definition);
    if (validation.success && !matchesRelationalIdentity(validation.value, row)) {
      return invalidIdentitySentinel(row);
    }

    return validation.success ? validation.value : row.definition;
  }
}

export class FormDefinitionPersistenceError extends Error {
  override readonly name = 'FormDefinitionPersistenceError';

  constructor(readonly formId: string) {
    super(`Unable to read persisted form definition "${formId}".`);
  }
}

function matchesRelationalIdentity(
  definition: { readonly id: string; readonly formVersion: number; readonly schemaVersion: number },
  row: { rowFormId: string; rowVersion: number; rowSchemaVersion: number },
): boolean {
  return (
    definition.id === row.rowFormId &&
    definition.formVersion === row.rowVersion &&
    definition.schemaVersion === row.rowSchemaVersion
  );
}

function invalidIdentitySentinel(row: {
  rowFormId: string;
  rowVersion: number;
  rowSchemaVersion: number;
}): unknown {
  return {
    id: row.rowFormId,
    formVersion: row.rowVersion,
    schemaVersion: row.rowSchemaVersion,
    invalidPersistenceIdentity: true,
  };
}
