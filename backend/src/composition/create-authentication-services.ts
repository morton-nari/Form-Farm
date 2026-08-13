import type { AuthenticationApplicationServices } from '../app.js';
import { Login } from '../application/authentication/login.js';
import { Logout } from '../application/authentication/logout.js';
import { RegisterAccount } from '../application/authentication/register-account.js';
import { ResolveSession } from '../application/authentication/resolve-session.js';
import type { BackendConfig } from '../config/backend-config.js';
import { AuthenticationRateLimiter } from '../http/authentication/authentication-rate-limiter.js';
import { XsrfTokenService } from '../http/authentication/xsrf-token-service.js';
import { Argon2PasswordHasher } from '../infrastructure/authentication/argon2-password-hasher.js';
import { CommonPasswordBlocklist } from '../infrastructure/authentication/common-password-blocklist.js';
import { NodeAuthenticationRateLimitKeyGenerator } from '../infrastructure/authentication/node-authentication-rate-limit-key-generator.js';
import { NodeSessionCredentialGenerator } from '../infrastructure/authentication/node-session-credential-generator.js';
import { PostgresAuthenticationRateLimitRepository } from '../infrastructure/authentication/postgres-authentication-rate-limit-repository.js';
import { PostgresSessionRepository } from '../infrastructure/authentication/postgres-session-repository.js';
import { PostgresUserAccountRepository } from '../infrastructure/authentication/postgres-user-account-repository.js';
import type { FormFarmDatabase } from '../infrastructure/database/create-database.js';

export function createAuthenticationServices(
  database: FormFarmDatabase,
  config: BackendConfig['auth'],
): AuthenticationApplicationServices {
  const accounts = new PostgresUserAccountRepository(database);
  const sessions = new PostgresSessionRepository(database);
  const passwords = new Argon2PasswordHasher();
  const credentials = new NodeSessionCredentialGenerator();
  const rateLimitKeyGenerators = [
    new NodeAuthenticationRateLimitKeyGenerator(Buffer.from(config.rateLimitCurrentSecret)),
    ...(config.rateLimitPreviousSecret
      ? [new NodeAuthenticationRateLimitKeyGenerator(Buffer.from(config.rateLimitPreviousSecret))]
      : []),
  ];

  return {
    registerAccount: new RegisterAccount(accounts, passwords, new CommonPasswordBlocklist()),
    login: new Login(accounts, passwords, credentials, sessions, {
      idleTimeoutMilliseconds: config.sessionIdleTimeoutMilliseconds,
      absoluteTimeoutMilliseconds: config.sessionAbsoluteTimeoutMilliseconds,
    }),
    logout: new Logout(sessions, credentials),
    resolveSession: new ResolveSession(
      sessions,
      credentials,
      config.sessionIdleTimeoutMilliseconds,
      config.sessionActivityWriteCadenceMilliseconds,
    ),
    rateLimiter: new AuthenticationRateLimiter(
      new PostgresAuthenticationRateLimitRepository(database),
      rateLimitKeyGenerators,
      config.rateLimitWindowMilliseconds,
    ),
    xsrfTokens: new XsrfTokenService(
      config.xsrfCurrentSecret,
      config.xsrfPreviousSecret,
      config.xsrfLifetimeMilliseconds,
    ),
  };
}
