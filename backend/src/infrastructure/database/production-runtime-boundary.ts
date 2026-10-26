export interface ProductionRuntimeBoundary {
  superuser: boolean;
  can_login: boolean;
  create_database: boolean;
  create_role: boolean;
  membership_count: number;
  schema_create: boolean;
  migration_ledger: boolean;
  runtime_table_access: boolean;
  development_only_table_access: boolean;
  database_connect: boolean;
  schema_usage: boolean;
}

export function isProductionRuntimeBoundaryValid(
  result: ProductionRuntimeBoundary | undefined,
): boolean {
  return Boolean(
    result &&
      result.can_login &&
      !result.superuser &&
      !result.create_database &&
      !result.create_role &&
      result.membership_count === 0 &&
      !result.schema_create &&
      !result.migration_ledger &&
      result.database_connect &&
      result.schema_usage &&
      result.runtime_table_access &&
      !result.development_only_table_access,
  );
}
