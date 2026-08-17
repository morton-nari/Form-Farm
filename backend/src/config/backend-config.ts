import { z } from 'zod';

const environmentSchema = z.enum(['development', 'test', 'production']);
const deploymentStageSchema = z.enum(['development', 'preview', 'production']);
const logLevelSchema = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);
const secretSchema = z.string().min(32);

const authConfigSchema = z
  .strictObject({
    publicOrigin: z.url(),
    secureCookies: z.boolean(),
    trustedProxyHops: z.number().int().min(0).max(10),
    sessionIdleTimeoutMilliseconds: z.number().int().positive(),
    sessionAbsoluteTimeoutMilliseconds: z.number().int().positive(),
    sessionActivityWriteCadenceMilliseconds: z.number().int().positive(),
    xsrfLifetimeMilliseconds: z.number().int().positive(),
    xsrfCurrentSecret: secretSchema,
    xsrfPreviousSecret: secretSchema.optional(),
    rateLimitCurrentSecret: secretSchema,
    rateLimitPreviousSecret: secretSchema.optional(),
    previousSecretValidUntilMilliseconds: z.number().int().positive().optional(),
    registrationRateLimit: z.number().int().positive(),
    loginRateLimit: z.number().int().positive(),
    rateLimitWindowMilliseconds: z.number().int().positive(),
  })
  .superRefine((value, context) => {
    const origin = parseExactOrigin(value.publicOrigin);
    if (!origin) context.addIssue({ code: 'custom', path: ['publicOrigin'], message: 'origin' });
    if (value.sessionActivityWriteCadenceMilliseconds >= value.sessionIdleTimeoutMilliseconds) {
      context.addIssue({
        code: 'custom',
        path: ['sessionActivityWriteCadenceMilliseconds'],
        message: 'cadence',
      });
    }
    if (value.sessionIdleTimeoutMilliseconds > value.sessionAbsoluteTimeoutMilliseconds) {
      context.addIssue({
        code: 'custom',
        path: ['sessionIdleTimeoutMilliseconds'],
        message: 'timeout',
      });
    }
    const hasPreviousSecret = Boolean(value.xsrfPreviousSecret || value.rateLimitPreviousSecret);
    if (hasPreviousSecret !== (value.previousSecretValidUntilMilliseconds !== undefined)) {
      context.addIssue({
        code: 'custom',
        path: ['previousSecretValidUntilMilliseconds'],
        message: 'rotation',
      });
    }
  });

const backendConfigSchema = z.strictObject({
  environment: environmentSchema,
  deploymentStage: deploymentStageSchema,
  host: z.string().trim().min(1),
  port: z.number().int().min(1).max(65_535),
  logLevel: logLevelSchema,
  databaseUrl: z.url(),
  databasePoolMax: z.number().int().min(1).max(100),
  auth: authConfigSchema,
});

export type BackendConfig = Readonly<z.infer<typeof backendConfigSchema>>;

export class BackendConfigurationError extends Error {
  override readonly name = 'BackendConfigurationError';

  constructor(readonly fields: readonly string[]) {
    super(`Invalid backend configuration: ${fields.join(', ')}.`);
  }
}

export function loadBackendConfig(environment: NodeJS.ProcessEnv = process.env): BackendConfig {
  const deploymentStage = environment['APP_ENV'] ?? 'development';
  const development = deploymentStage === 'development';
  const port = parsePort(environment['PORT']);
  const result = backendConfigSchema.safeParse({
    environment: environment['NODE_ENV'] ?? 'development',
    deploymentStage,
    host: environment['HOST'] ?? '127.0.0.1',
    port,
    logLevel: environment['LOG_LEVEL'] ?? 'info',
    databaseUrl: environment['DATABASE_URL'],
    databasePoolMax: parsePositiveInteger(
      environment['DATABASE_POOL_MAX'],
      development ? 10 : Number.NaN,
    ),
    auth: {
      publicOrigin:
        environment['PUBLIC_APP_ORIGIN'] ?? (development ? 'http://localhost:4200' : undefined),
      secureCookies: parseBoolean(environment['AUTH_SECURE_COOKIES'], !development),
      trustedProxyHops: parseNonNegativeInteger(environment['TRUSTED_PROXY_HOPS'], 0),
      sessionIdleTimeoutMilliseconds: parsePositiveInteger(
        environment['SESSION_IDLE_TIMEOUT_MS'],
        30 * 60_000,
      ),
      sessionAbsoluteTimeoutMilliseconds: parsePositiveInteger(
        environment['SESSION_ABSOLUTE_TIMEOUT_MS'],
        7 * 24 * 60 * 60_000,
      ),
      sessionActivityWriteCadenceMilliseconds: parsePositiveInteger(
        environment['SESSION_ACTIVITY_CADENCE_MS'],
        5 * 60_000,
      ),
      xsrfLifetimeMilliseconds: parsePositiveInteger(environment['XSRF_LIFETIME_MS'], 10 * 60_000),
      xsrfCurrentSecret:
        environment['XSRF_HMAC_SECRET'] ??
        (development ? 'development-only-xsrf-secret-change-me' : undefined),
      xsrfPreviousSecret: environment['XSRF_PREVIOUS_HMAC_SECRET'],
      rateLimitCurrentSecret:
        environment['RATE_LIMIT_HMAC_SECRET'] ??
        (development ? 'development-only-rate-secret-change-me' : undefined),
      rateLimitPreviousSecret: environment['RATE_LIMIT_PREVIOUS_HMAC_SECRET'],
      previousSecretValidUntilMilliseconds: parseOptionalTimestamp(
        environment['AUTH_PREVIOUS_SECRET_VALID_UNTIL'],
      ),
      registrationRateLimit: parsePositiveInteger(environment['REGISTRATION_RATE_LIMIT'], 5),
      loginRateLimit: parsePositiveInteger(environment['LOGIN_RATE_LIMIT'], 10),
      rateLimitWindowMilliseconds: parsePositiveInteger(
        environment['AUTH_RATE_LIMIT_WINDOW_MS'],
        15 * 60_000,
      ),
    },
  });

  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? 'config'))),
    ];
    throw new BackendConfigurationError(fields);
  }

  validateDeploymentOwnership(result.data, environment);

  if (!development) {
    const origin = new URL(result.data.auth.publicOrigin);
    if (!result.data.auth.secureCookies || origin.protocol !== 'https:') {
      throw new BackendConfigurationError(['auth']);
    }
    const configuredSecrets = [
      result.data.auth.xsrfCurrentSecret,
      result.data.auth.xsrfPreviousSecret,
      result.data.auth.rateLimitCurrentSecret,
      result.data.auth.rateLimitPreviousSecret,
    ].filter((value): value is string => value !== undefined);
    if (configuredSecrets.some((secret) => !hasProductionSecretEntropy(secret))) {
      throw new BackendConfigurationError(['auth']);
    }
  }
  const publicOrigin = new URL(result.data.auth.publicOrigin);
  const insecureLoopback =
    publicOrigin.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(publicOrigin.hostname);
  if (
    (result.data.auth.secureCookies && publicOrigin.protocol !== 'https:') ||
    (!result.data.auth.secureCookies && !insecureLoopback)
  ) {
    throw new BackendConfigurationError(['auth']);
  }
  const secrets = [
    result.data.auth.xsrfCurrentSecret,
    result.data.auth.xsrfPreviousSecret,
    result.data.auth.rateLimitCurrentSecret,
    result.data.auth.rateLimitPreviousSecret,
  ].filter((value): value is string => value !== undefined);
  if (new Set(secrets).size !== secrets.length) throw new BackendConfigurationError(['auth']);
  const previousValidUntil = result.data.auth.previousSecretValidUntilMilliseconds;
  if (
    previousValidUntil !== undefined &&
    (previousValidUntil <= Date.now() || previousValidUntil > Date.now() + 24 * 60 * 60_000)
  ) {
    throw new BackendConfigurationError(['auth']);
  }

  Object.freeze(result.data.auth);
  return Object.freeze(result.data);
}

function validateDeploymentOwnership(
  config: z.infer<typeof backendConfigSchema>,
  environment: NodeJS.ProcessEnv,
): void {
  if (config.deploymentStage === 'development') {
    if (environment['VERCEL'] === '1') throw new BackendConfigurationError(['deploymentStage']);
    return;
  }

  const invalidFields: string[] = [];
  if (config.environment !== 'production') invalidFields.push('environment');
  if (environment['DATABASE_ENVIRONMENT'] !== config.deploymentStage) {
    invalidFields.push('databaseEnvironment');
  }
  if (environment['AUTH_SECRET_ENVIRONMENT'] !== config.deploymentStage) {
    invalidFields.push('authSecretEnvironment');
  }
  if (!isNeonPooledApplicationUrl(config.databaseUrl)) invalidFields.push('databaseUrl');

  if (environment['VERCEL'] === '1') {
    if (environment['VERCEL_ENV'] !== config.deploymentStage) invalidFields.push('deploymentStage');
    const vercelUrl =
      config.deploymentStage === 'preview'
        ? environment['VERCEL_BRANCH_URL']
        : environment['VERCEL_PROJECT_PRODUCTION_URL'];
    if (!vercelUrl || config.auth.publicOrigin !== `https://${vercelUrl}`) {
      invalidFields.push('publicOrigin');
    }
  }

  if (invalidFields.length > 0) throw new BackendConfigurationError([...new Set(invalidFields)]);
}

function isNeonPooledApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'postgresql:' &&
      url.hostname.endsWith('.neon.tech') &&
      url.hostname.split('.')[0]?.endsWith('-pooler') === true &&
      url.searchParams.get('sslmode') === 'require'
    );
  } catch {
    return false;
  }
}

function hasProductionSecretEntropy(value: string): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return false;
  return Buffer.from(value, 'base64url').length === 32;
}

function parseExactOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.origin === value && (url.protocol === 'http:' || url.protocol === 'https:')
      ? value
      : undefined;
  } catch {
    return undefined;
  }
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

function parseNonNegativeInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) return Number.NaN;
  return Number(value);
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean | number {
  if (value === undefined) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return Number.NaN;
}

function parseOptionalTimestamp(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? Number.NaN : timestamp;
}
