export interface AccessibleFormRecord {
  readonly definition: unknown;
  readonly updatedAt: unknown;
  readonly rowFormId: string;
  readonly rowVersion: number;
  readonly rowSchemaVersion: number;
}

export interface AccessibleFormSource {
  findPublishedByIdForUser(formId: string, userId: string): Promise<AccessibleFormRecord | undefined>;
  listPublishedForUser(userId: string): Promise<readonly AccessibleFormRecord[]>;
}
