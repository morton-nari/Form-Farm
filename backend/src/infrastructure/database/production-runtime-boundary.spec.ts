import { describe, expect, it } from 'vitest';

import {
  isProductionRuntimeBoundaryValid,
  type ProductionRuntimeBoundary,
} from './production-runtime-boundary.js';

const validBoundary: ProductionRuntimeBoundary = {
  superuser: false,
  can_login: true,
  create_database: false,
  create_role: false,
  membership_count: 0,
  schema_create: false,
  migration_ledger: false,
  runtime_table_access: true,
  development_only_table_access: false,
  database_connect: true,
  schema_usage: true,
};

describe('isProductionRuntimeBoundaryValid', () => {
  it('accepts a runtime role with zero inherited memberships', () => {
    expect(isProductionRuntimeBoundaryValid(validBoundary)).toBe(true);
  });

  it('fails closed when the runtime role inherits any membership', () => {
    expect(
      isProductionRuntimeBoundaryValid({
        ...validBoundary,
        membership_count: 1,
      }),
    ).toBe(false);
  });

  it('fails closed when no matching runtime role is returned', () => {
    expect(isProductionRuntimeBoundaryValid(undefined)).toBe(false);
  });
});
