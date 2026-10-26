import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function verifyVercelDeployment(payload, environment) {
  const commit = requireValue(environment.APPLICATION_COMMIT, 'APPLICATION_COMMIT');
  const projectId = requireValue(environment.VERCEL_PROJECT_ID, 'VERCEL_PROJECT_ID');
  const teamId = requireValue(environment.VERCEL_ORG_ID, 'VERCEL_ORG_ID');
  if (!/^[0-9a-f]{40}$/.test(commit)) fail('invalid-application-commit');
  if (!/^dpl_[A-Za-z0-9]+$/.test(payload.id)) fail('invalid-deployment-identity');
  if (payload.projectId !== projectId) fail('project-mismatch');
  if (payload.teamId !== undefined && payload.teamId !== teamId) fail('team-mismatch');
  if (payload.target !== 'production') fail('target-mismatch');
  if (payload.meta?.formFarmApplicationCommit !== commit) fail('commit-mismatch');
  return payload.id;
}

export async function fetchAndVerifyVercelDeployment(
  reference,
  environment,
  fetchImplementation = fetch,
) {
  if (!/^(dpl_[A-Za-z0-9]+|https:\/\/[A-Za-z0-9.-]+\.vercel\.app)$/.test(reference)) {
    throw new Error('Invalid deployment reference.');
  }
  const lookupReference = reference.startsWith('https://')
    ? new URL(reference).hostname
    : reference;
  const token = requireValue(environment.VERCEL_TOKEN, 'VERCEL_TOKEN');
  const teamId = requireValue(environment.VERCEL_ORG_ID, 'VERCEL_ORG_ID');
  const response = await fetchImplementation(
    `https://api.vercel.com/v13/deployments/${encodeURIComponent(lookupReference)}?teamId=${encodeURIComponent(teamId)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!response.ok) fail('lookup-failed');
  return verifyVercelDeployment(await response.json(), environment);
}

function fail(reason) {
  throw new Error(`deployment-verification:${reason}`);
}

function requireValue(value, name) {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    process.stdout.write(await fetchAndVerifyVercelDeployment(process.argv[2] ?? '', process.env));
  } catch (error) {
    const message = error instanceof Error && /^deployment-verification:[a-z-]+$/.test(error.message)
      ? error.message
      : 'deployment-verification:failed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
