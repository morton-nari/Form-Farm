const REQUIRED_CHECKS = [
  'Frontend and domain',
  'Form domain',
  'Backend',
  'Backend integration',
  'Deployment',
];
const GITHUB_ACTIONS_APP_ID = 15368;
const GITHUB_ACTIONS_APP_SLUG = 'github-actions';

export async function verifyRequiredChecks(environment, fetchImplementation = fetch) {
  const repository = requireValue(environment.GITHUB_REPOSITORY, 'GITHUB_REPOSITORY');
  const sha = requireValue(environment.APPLICATION_COMMIT, 'APPLICATION_COMMIT');
  const token = requireValue(environment.GITHUB_TOKEN, 'GITHUB_TOKEN');
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('Invalid application commit.');
  const response = await fetchImplementation(
    `https://api.github.com/repos/${repository}/commits/${sha}/check-runs?filter=latest&per_page=100`,
    { headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error('Required-check lookup failed.');
  const payload = await response.json();
  for (const name of REQUIRED_CHECKS) {
    const matchingRuns = (payload.check_runs ?? []).filter((candidate) => candidate.name === name);
    if (matchingRuns.length !== 1) {
      throw new Error('A required check is missing or ambiguous.');
    }
    const [run] = matchingRuns;
    const expectedDetailsPrefix = `https://github.com/${repository}/actions/runs/`;
    if (
      run.app?.id !== GITHUB_ACTIONS_APP_ID ||
      run.app?.slug !== GITHUB_ACTIONS_APP_SLUG ||
      !run.details_url?.startsWith(expectedDetailsPrefix)
    ) {
      throw new Error('A required check has untrusted provenance.');
    }
    if (run?.status !== 'completed' || run?.conclusion !== 'success') {
      throw new Error('A required check is missing or not successful.');
    }
  }
  return REQUIRED_CHECKS.length;
}

function requireValue(value, name) {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const count = await verifyRequiredChecks(process.env);
    process.stdout.write(`required-checks:pass:${count}\n`);
  } catch {
    process.stderr.write('required-checks:failed\n');
    process.exitCode = 1;
  }
}
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
