import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const cliVersion = '59.1.3';

export function createVercelProtectedFetch(environment, run = spawnSync) {
  const origin = requireExactOrigin(environment.PRODUCTION_SMOKE_ORIGIN);
  const token = environment.VERCEL_TOKEN;
  const scope = environment.VERCEL_ORG_ID;
  const protectionBypass = environment.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!token) throw new Error('Protected Production smoke requires VERCEL_TOKEN.');
  if (!scope) throw new Error('Protected Production smoke requires VERCEL_ORG_ID.');
  if (!protectionBypass) {
    throw new Error('Protected Production smoke requires VERCEL_AUTOMATION_BYPASS_SECRET.');
  }

  return async (input, options = {}) => {
    const url = new URL(input);
    if (url.origin !== origin) throw new Error('Protected Production smoke URL escaped its origin.');
    if (options.method && options.method !== 'GET') {
      throw new Error('Protected Production smoke permits GET requests only.');
    }

    const directory = await mkdtemp(join(tmpdir(), 'form-farm-production-smoke-'));
    const headersPath = join(directory, 'headers.txt');
    const bodyPath = join(directory, 'body.bin');
    try {
      const args = [
        '--yes',
        `vercel@${cliVersion}`,
        'curl',
        `${url.pathname}${url.search}`,
        `--deployment=${origin}`,
        `--token=${token}`,
        `--scope=${scope}`,
        '--',
        '--silent',
        '--show-error',
        '--dump-header',
        headersPath,
        '--output',
        bodyPath,
        '--write-out',
        '%{http_code}',
      ];
      const cookie = new Headers(options.headers).get('cookie');
      if (cookie) args.push('--header', `Cookie: ${cookie}`);

      const result = run(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, {
        encoding: 'utf8',
        env: { ...process.env, VERCEL_AUTOMATION_BYPASS_SECRET: protectionBypass },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (result.status !== 0 || !/^\d{3}$/.test(result.stdout)) {
        throw new ProtectedVercelTransportError(classifyCliFailure(result.stderr));
      }

      const [rawHeaders, body] = await Promise.all([
        readFile(headersPath, 'utf8'),
        readFile(bodyPath),
      ]);
      return new Response(body.length === 0 ? null : body, {
        status: Number(result.stdout),
        headers: parseFinalHeaders(rawHeaders),
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  };
}

class ProtectedVercelTransportError extends Error {
  constructor(category) {
    super('Authenticated Vercel request failed.');
    this.name = 'ProtectedVercelTransportError';
    this.productionSmokeTransportCategory = category;
  }
}

function classifyCliFailure(stderr) {
  const output = typeof stderr === 'string' ? stderr : '';
  if (/forbidden|not authorized|permission denied|access denied/i.test(output)) return 'authorization';
  if (/protection|bypass|trusted.sources/i.test(output)) return 'protection';
  if (/deployment.{0,40}not found|could not find.{0,40}deployment/i.test(output)) return 'deployment-lookup';
  if (/curl.{0,20}(?:not found|enoent)/i.test(output)) return 'native-curl';
  if (/unauthorized|authentication|invalid token|log in/i.test(output)) return 'authentication';
  return 'unknown';
}

function requireExactOrigin(value) {
  if (!value) throw new Error('PRODUCTION_SMOKE_ORIGIN is required.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.origin !== value || url.pathname !== '/') {
    throw new Error('PRODUCTION_SMOKE_ORIGIN must be an exact HTTPS origin.');
  }
  return value;
}

function parseFinalHeaders(rawHeaders) {
  const blocks = rawHeaders.trim().split(/\r?\n\r?\n/);
  const block = [...blocks].reverse().find((candidate) => candidate.startsWith('HTTP/'));
  if (!block) throw new Error('Authenticated Vercel response headers were invalid.');
  const headers = new Headers();
  for (const line of block.split(/\r?\n/).slice(1)) {
    const separator = line.indexOf(':');
    if (separator > 0) headers.append(line.slice(0, separator), line.slice(separator + 1).trim());
  }
  return headers;
}
