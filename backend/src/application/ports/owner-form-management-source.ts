export interface OwnerFormManagementRecord {
  readonly definition: unknown;
  readonly rowFormId: string;
  readonly status: 'draft' | 'published' | 'archived';
  readonly latestVersion: number;
  readonly currentPublishedVersion: number | null;
  readonly draftRevision: number | null;
  readonly definitionVersion: number;
  readonly updatedAt: unknown;
}

export interface OwnerFormManagementSource {
  list(input: {
    readonly userId: string;
    readonly limit: number;
    readonly cursor?: { readonly updatedAt: Date; readonly formId: string };
  }): Promise<readonly OwnerFormManagementRecord[]>;
}
