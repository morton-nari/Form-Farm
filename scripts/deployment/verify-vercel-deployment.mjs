import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function verifyVercelDeployment(payload, environment) {
  const commit = requireValue(environment.APPLICATION_COMMIT, 'APPLICATION_COMMIT');
  const projectId = requireValue(environment.VERCEL_PROJECT_ID, 'VERCEL_PROJECT_ID');
  const teamId = requireValue(environment.VERCEL_ORG_ID, 'VERCEL_ORG_ID');
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('Invalid application commit.');
  if (!/^dpl_[A-Za-z0-9]+$/.test(payload.id)) throw new Error('Invalid deployment identity.');
  if (
    payload.meta?.githubCommitSha !== commit ||
    payload.target !== 'production' ||
    payload.projectId !== projectId ||
    payload.teamId !== teamId
  ) {
    throw new Error('Deployment does not match the reviewed Production target.');
  }
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
  const token = requireValue(environment.VERCEL_TOKEN, 'VERCEL_TOKEN');
  const teamId = requireValue(environment.VERCEL_ORG_ID, 'VERCEL_ORG_ID');
  const response = await fetchImplementation(
    `https://api.vercel.com/v13/deployments/${encodeURIComponent(reference)}?teamId=${encodeURIComponent(teamId)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error('Deployment lookup failed.');
  return verifyVercelDeployment(await response.json(), environment);
}

function requireValue(value, name) {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    process.stdout.write(await fetchAndVerifyVercelDeployment(process.argv[2] ?? '', process.env));
  } catch {
    process.stderr.write('deployment-verification:failed\n');
    process.exitCode = 1;
  }
}
