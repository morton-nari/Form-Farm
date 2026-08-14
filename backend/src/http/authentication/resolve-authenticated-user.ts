import type { FastifyRequest } from 'fastify';

import { authenticationCookieNames } from '../routes/authentication.route.js';
import { UnauthenticatedError } from './authentication-errors.js';

export async function resolveAuthenticatedUser(
  request: FastifyRequest,
  secureCookies: boolean,
  resolveSession: {
    execute(sessionCredential: string): Promise<{ readonly userId: string } | undefined>;
  },
): Promise<string> {
  const credential = request.cookies[authenticationCookieNames(secureCookies).session];
  const actor = credential ? await resolveSession.execute(credential) : undefined;
  if (!actor) throw new UnauthenticatedError();
  return actor.userId;
}
