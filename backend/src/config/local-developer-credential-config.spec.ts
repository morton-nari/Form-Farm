import { describe, expect, it } from 'vitest';

import {
  LOCAL_DEVELOPER_CREDENTIAL_ENVIRONMENT_VARIABLE,
  readLocalDeveloperCredential,
} from './local-developer-credential-config.js';

describe('readLocalDeveloperCredential', () => {
  it('reads only the named variable in an explicit development stage', () => {
    expect(
      readLocalDeveloperCredential({
        APP_ENV: 'development',
        FORM_FARM_DEVELOPER_CREDENTIAL: 'opaque-value',
        OWNER_ID: 'must-not-authenticate',
      }),
    ).toBe('opaque-value');
  });

  it.each(['preview', 'production', undefined])(
    'rejects the credential outside explicit development (%s)',
    (stage) => {
      expect(() =>
        readLocalDeveloperCredential({
          APP_ENV: stage,
          FORM_FARM_DEVELOPER_CREDENTIAL: 'must-not-appear-in-error',
        }),
      ).toThrow('APP_ENV');
    },
  );

  it.each([undefined, '', ' credential', 'credential\n', 'x'.repeat(257)])(
    'rejects missing or unsafe transport values without exposing them (%s)',
    (credential) => {
      let caught: unknown;
      try {
        readLocalDeveloperCredential({
          APP_ENV: 'development',
          FORM_FARM_DEVELOPER_CREDENTIAL: credential,
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({
        name: 'LocalDeveloperCredentialConfigurationError',
        field: LOCAL_DEVELOPER_CREDENTIAL_ENVIRONMENT_VARIABLE,
      });
      expect(String(caught)).toBe(
        `LocalDeveloperCredentialConfigurationError: Invalid local developer credential configuration: ${LOCAL_DEVELOPER_CREDENTIAL_ENVIRONMENT_VARIABLE}.`,
      );
    },
  );
});
