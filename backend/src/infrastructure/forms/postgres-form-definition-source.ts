import { and, eq } from 'drizzle-orm';

import type { FormDefinitionSource } from '../../application/ports/form-definition-source.js';
import type { FormFarmDatabase } from '../database/create-database.js';
import { forms, formVersions } from '../database/schema.js';

export class PostgresFormDefinitionSource implements FormDefinitionSource {
  constructor(private readonly database: FormFarmDatabase) {}

  async findById(formId: string): Promise<unknown | undefined> {
    const rows = await this.database
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

    const row = rows[0];
    if (!row) return undefined;

    if (!matchesRelationalIdentity(row.definition, row)) {
      return invalidIdentitySentinel(row);
    }

    return row.definition;
  }
}

function matchesRelationalIdentity(
  definition: unknown,
  row: { rowFormId: string; rowVersion: number; rowSchemaVersion: number },
): boolean {
  if (typeof definition !== 'object' || definition === null) return false;
  const value = definition as Record<string, unknown>;
  return (
    value['id'] === row.rowFormId &&
    value['formVersion'] === row.rowVersion &&
    value['schemaVersion'] === row.rowSchemaVersion
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
