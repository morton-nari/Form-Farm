import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const APPROVAL = 'ROTATE PRODUCTION AUTH SECRETS';
const KEYS = new Set(['AUTH_SECURE_COOKIES', 'XSRF_HMAC_SECRET', 'RATE_LIMIT_HMAC_SECRET']);

export async function repairProductionAuthConfig(environment, fetchImplementation = fetch) {
  requireExact(environment.PRODUCTION_AUTH_REPAIR_APPROVAL, APPROVAL, 'approval');
  const projectId = requireIdentifier(environment.VERCEL_PROJECT_ID, 'project');
  const teamId = requireIdentifier(environment.VERCEL_ORG_ID, 'team');
  const token = requireValue(environment.VERCEL_TOKEN, 'token');
  const query = `teamId=${encodeURIComponent(teamId)}`;
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const listResponse = await fetchImplementation(
    `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env?${query}`,
    { headers: { authorization: headers.authorization } },
  );
  if (!listResponse.ok) throw new Error('production-auth-repair:environment-lookup-failed');
  const payload = await listResponse.json();
  const variables = Array.isArray(payload.envs) ? payload.envs : [];
  const selected = new Map();
  for (const variable of variables) {
    if (!KEYS.has(variable?.key) || !Array.isArray(variable.target) || !variable.target.includes('production')) continue;
    if (selected.has(variable.key)) throw new Error('production-auth-repair:ambiguous-variable');
    selected.set(variable.key, variable);
  }
  if (selected.size !== KEYS.size) throw new Error('production-auth-repair:missing-variable');

  const updates = new Map([
    ['AUTH_SECURE_COOKIES', 'true'],
    ['XSRF_HMAC_SECRET', randomBytes(32).toString('base64url')],
    ['RATE_LIMIT_HMAC_SECRET', randomBytes(32).toString('base64url')],
  ]);
  if (updates.get('XSRF_HMAC_SECRET') === updates.get('RATE_LIMIT_HMAC_SECRET')) {
    throw new Error('production-auth-repair:randomness-failed');
  }

  for (const [key, value] of updates) {
    const variable = selected.get(key);
    const response = await fetchImplementation(
      `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(variable.id)}?${query}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ value }),
      },
    );
    if (!response.ok) throw new Error(`production-auth-repair:update-failed:${safeKey(key)}`);
  }
  return [...updates.keys()];
}

function safeKey(key) {
  return KEYS.has(key) ? key : 'unknown';
}

function requireIdentifier(value, label) {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(`production-auth-repair:invalid-${label}`);
  return value;
}

function requireValue(value, label) {
  if (!value) throw new Error(`production-auth-repair:missing-${label}`);
  return value;
}

function requireExact(value, expected, label) {
  if (value !== expected) throw new Error(`production-auth-repair:invalid-${label}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const updated = await repairProductionAuthConfig(process.env);
    process.stdout.write(`production-auth-repair:complete:${updated.sort().join(',')}\n`);
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith('production-auth-repair:')
      ? error.message
      : 'production-auth-repair:failed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
