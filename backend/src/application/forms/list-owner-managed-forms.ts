import { validateFormDefinition, validateFormDraftDefinition } from '@form-farm/form-domain';
import type { OwnerFormManagementSource } from '../ports/owner-form-management-source.js';
import { InvalidStoredFormDefinitionError } from './get-form-definition.js';

export interface OwnerManagedFormSummary {
  readonly id: string;
  readonly title: string;
  readonly status: 'draft' | 'published' | 'archived';
  readonly latestVersion: number;
  readonly currentPublishedVersion: number | null;
  readonly draftRevision: number | null;
  readonly updatedAt: string;
}

export class ListOwnerManagedForms {
  constructor(private readonly source: OwnerFormManagementSource) {}
  async execute(userId: string, limit: number, cursor?: { updatedAt: Date; formId: string }) {
    const records = await this.source.list({
      userId,
      limit: limit + 1,
      ...(cursor ? { cursor } : {}),
    });
    const hasMore = records.length > limit;
    const selected = records.slice(0, limit);
    const forms = selected.map((record) => {
      if (
        !Number.isSafeInteger(record.latestVersion) ||
        record.latestVersion < 0 ||
        !Number.isSafeInteger(record.definitionVersion) ||
        record.definitionVersion < 1 ||
        (record.currentPublishedVersion !== null &&
          (!Number.isSafeInteger(record.currentPublishedVersion) ||
            record.currentPublishedVersion < 1)) ||
        (record.draftRevision !== null &&
          (!Number.isSafeInteger(record.draftRevision) || record.draftRevision < 1))
      )
        throw new InvalidStoredFormDefinitionError(record.rowFormId, 1);
      const expectedDefinitionVersion =
        record.draftRevision === null ? record.currentPublishedVersion : record.latestVersion + 1;
      const lifecycleValid =
        (record.status === 'draft' &&
          record.latestVersion === 0 &&
          record.currentPublishedVersion === null &&
          record.draftRevision !== null) ||
        (record.status === 'published' &&
          record.latestVersion >= 1 &&
          record.currentPublishedVersion === record.latestVersion) ||
        (record.status === 'archived' &&
          record.latestVersion >= 1 &&
          record.currentPublishedVersion !== null &&
          record.draftRevision === null);
      if (
        !lifecycleValid ||
        expectedDefinitionVersion !== record.definitionVersion ||
        (record.draftRevision !== null && record.latestVersion >= 2_147_483_647)
      )
        throw new InvalidStoredFormDefinitionError(record.rowFormId, 1);
      const result =
        record.draftRevision === null
          ? validateFormDefinition(record.definition)
          : validateFormDraftDefinition(record.definition);
      if (
        !result.success ||
        result.value.id !== record.rowFormId ||
        result.value.formVersion !== record.definitionVersion
      ) {
        throw new InvalidStoredFormDefinitionError(
          record.rowFormId,
          result.success ? 1 : result.issues.length,
        );
      }
      if (!(record.updatedAt instanceof Date) || Number.isNaN(record.updatedAt.valueOf()))
        throw new InvalidStoredFormDefinitionError(record.rowFormId, 1);
      return {
        id: record.rowFormId,
        title: result.value.title,
        status: record.status,
        latestVersion: record.latestVersion,
        currentPublishedVersion: record.currentPublishedVersion,
        draftRevision: record.draftRevision,
        updatedAt: record.updatedAt.toISOString(),
      };
    });
    const last = hasMore ? selected.at(-1) : undefined;
    return {
      forms,
      nextCursor: last ? { updatedAt: last.updatedAt as Date, formId: last.rowFormId } : undefined,
    };
  }
}
