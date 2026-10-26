import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function promoteVercelDeployment(environment, fetchImplementation = fetch) {
  const projectId = requireIdentifier(environment.VERCEL_PROJECT_ID, /^prj_[A-Za-z0-9]+$/);
  const teamId = requireIdentifier(environment.VERCEL_ORG_ID, /^team_[A-Za-z0-9]+$/);
  const deploymentId = requireIdentifier(environment.PRODUCTION_DEPLOYMENT_ID, /^dpl_[A-Za-z0-9]+$/);
  const token = requireValue(environment.VERCEL_TOKEN);
  const response = await fetchImplementation(
    `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/promote/${encodeURIComponent(deploymentId)}?teamId=${encodeURIComponent(teamId)}`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    },
  );
  if (!response.ok) throw new Error('production-promotion:request-failed');
  return deploymentId;
}

function requireIdentifier(value, pattern) {
  if (!value || !pattern.test(value)) throw new Error('production-promotion:invalid-configuration');
  return value;
}

function requireValue(value) {
  if (!value) throw new Error('production-promotion:invalid-configuration');
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    await promoteVercelDeployment(process.env);
    process.stdout.write('production-promotion:requested\n');
  } catch (error) {
    const message = error instanceof Error && /^production-promotion:[a-z-]+$/.test(error.message)
      ? error.message
      : 'production-promotion:failed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
