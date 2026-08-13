import { validateFormDefinition } from '@form-farm/form-domain';

import type { AccessibleFormSource } from '../ports/accessible-form-source.js';
import { InvalidStoredFormDefinitionError } from './get-form-definition.js';

export interface FormDashboardSummary {
  readonly id: string;
  readonly title: string;
  readonly formVersion: number;
  readonly updatedAt: string;
}

export class ListAccessibleForms {
  constructor(private readonly source: AccessibleFormSource) {}

  async execute(userId: string): Promise<readonly FormDashboardSummary[]> {
    const records = await this.source.listPublishedForUser(userId);
    return records.map((record) => {
      const validated = validateFormDefinition(record.definition);
      if (!validated.success) {
        throw new InvalidStoredFormDefinitionError('dashboard-result', validated.issues.length);
      }
      assertIdentity(validated.value, record);
      if (!(record.updatedAt instanceof Date) || Number.isNaN(record.updatedAt.valueOf())) {
        throw new InvalidFormSummaryError(validated.value.id);
      }
      return {
        id: validated.value.id,
        title: validated.value.title,
        formVersion: validated.value.formVersion,
        updatedAt: record.updatedAt.toISOString(),
      };
    });
  }
}

export function assertIdentity(
  definition: { readonly id: string; readonly formVersion: number; readonly schemaVersion: number },
  record: { readonly rowFormId: string; readonly rowVersion: number; readonly rowSchemaVersion: number },
): void {
  if (
    definition.id !== record.rowFormId ||
    definition.formVersion !== record.rowVersion ||
    definition.schemaVersion !== record.rowSchemaVersion
  ) {
    throw new InvalidStoredFormDefinitionError(record.rowFormId, 1);
  }
}

export class InvalidFormSummaryError extends Error {
  override readonly name = 'InvalidFormSummaryError';
  constructor(readonly formId: string) {
    super(`Stored dashboard summary for form "${formId}" is invalid.`);
  }
}
