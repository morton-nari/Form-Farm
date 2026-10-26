import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SAFE_CONFIGURATION_FIELDS = new Set([
  'auth',
  'authSecretEnvironment',
  'databaseEnvironment',
  'databasePoolMax',
  'databaseUrl',
  'deploymentStage',
  'environment',
  'host',
  'logLevel',
  'port',
  'publicOrigin',
]);

export function extractStartupDiagnostic(input) {
  const candidates = String(input).match(/form-farm-startup:(?:configuration:[A-Za-z,]+|initialization)/g) ?? [];
  const safe = new Set(candidates.map(normalizeStartupDiagnostic).filter(Boolean));
  return safe.size === 1 ? [...safe][0] : 'form-farm-startup:unavailable';
}

function normalizeStartupDiagnostic(candidate) {
  if (candidate === 'form-farm-startup:initialization') return candidate;
  const prefix = 'form-farm-startup:configuration:';
  if (!candidate.startsWith(prefix)) return undefined;
  const fields = candidate.slice(prefix.length).split(',');
  if (fields.length === 0 || fields.some((field) => !SAFE_CONFIGURATION_FIELDS.has(field))) {
    return undefined;
  }
  return `${prefix}${[...new Set(fields)].sort().join(',')}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  process.stdout.write(`${extractStartupDiagnostic(input)}\n`);
}
