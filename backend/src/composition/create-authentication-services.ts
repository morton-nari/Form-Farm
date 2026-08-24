import type { AuthenticationApplicationServices } from '../app.js';
import { Login } from '../application/authentication/login.js';
import { Logout } from '../application/authentication/logout.js';
import { RegisterAccount } from '../application/authentication/register-account.js';
import { ResolveSession } from '../application/authentication/resolve-session.js';
import {
  ConfirmAndIssueDeveloperCredential,
  IssueDeveloperCredential,
  ListDeveloperCredentials,
  RevokeDeveloperCredential,
} from '../application/authentication/developer-credentials.js';
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
import { NodeDeveloperCredentialCodec } from '../infrastructure/authentication/node-developer-credential-codec.js';
import { PostgresDeveloperCredentialRepository } from '../infrastructure/authentication/postgres-developer-credential-repository.js';
import { PostgresDeveloperCredentialPasswordSource } from '../infrastructure/authentication/postgres-developer-credential-password-source.js';
import type { FormFarmDatabase } from '../infrastructure/database/create-database.js';

export function createAuthenticationServices(
  database: FormFarmDatabase,
  config: BackendConfig['auth'],
): AuthenticationApplicationServices {
  const accounts = new PostgresUserAccountRepository(database);
  const sessions = new PostgresSessionRepository(database);
  const passwords = new Argon2PasswordHasher();
  const credentials = new NodeSessionCredentialGenerator();
  const developerCredentialRepository = new PostgresDeveloperCredentialRepository(database);
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
      config.previousSecretValidUntilMilliseconds,
    ),
    xsrfTokens: new XsrfTokenService(
      config.xsrfCurrentSecret,
      config.xsrfPreviousSecret,
      config.previousSecretValidUntilMilliseconds,
      config.xsrfLifetimeMilliseconds,
    ),
    developerCredentials: {
      issueDeveloperCredential: new ConfirmAndIssueDeveloperCredential(
        passwords,
        new PostgresDeveloperCredentialPasswordSource(database),
        new IssueDeveloperCredential(
          new NodeDeveloperCredentialCodec(),
          developerCredentialRepository,
        ),
      ),
      listDeveloperCredentials: new ListDeveloperCredentials(developerCredentialRepository),
      revokeDeveloperCredential: new RevokeDeveloperCredential(developerCredentialRepository),
    },
  };
}
