import { z } from 'zod';

const environmentSchema = z.enum(['development', 'test', 'production']);
const logLevelSchema = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);

const backendConfigSchema = z.strictObject({
  environment: environmentSchema,
  host: z.string().trim().min(1),
  port: z.number().int().min(1).max(65_535),
  logLevel: logLevelSchema,
  databaseUrl: z.url(),
  databasePoolMax: z.number().int().min(1).max(100),
});

export type BackendConfig = Readonly<z.infer<typeof backendConfigSchema>>;

export class BackendConfigurationError extends Error {
  override readonly name = 'BackendConfigurationError';

  constructor(readonly fields: readonly string[]) {
    super(`Invalid backend configuration: ${fields.join(', ')}.`);
  }
}

export function loadBackendConfig(environment: NodeJS.ProcessEnv = process.env): BackendConfig {
  const port = parsePort(environment['PORT']);
  const result = backendConfigSchema.safeParse({
    environment: environment['NODE_ENV'] ?? 'development',
    host: environment['HOST'] ?? '127.0.0.1',
    port,
    logLevel: environment['LOG_LEVEL'] ?? 'info',
    databaseUrl: environment['DATABASE_URL'],
    databasePoolMax: parsePositiveInteger(environment['DATABASE_POOL_MAX'], 10),
  });

  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? 'config'))),
    ];
    throw new BackendConfigurationError(fields);
  }

  return Object.freeze(result.data);
}

function parsePort(value: string | undefined): number {
  if (value === undefined) return 3000;
  if (!/^\d+$/.test(value)) return Number.NaN;
  return Number(value);
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) return Number.NaN;
  return Number(value);
}
