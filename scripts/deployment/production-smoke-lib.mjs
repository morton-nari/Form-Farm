export async function runProductionSmoke(environment, fetchImplementation = fetch, write = console.log) {
  const origin = requireOrigin(environment.PRODUCTION_SMOKE_ORIGIN);
  const checks = [
    ['health', '/health', 200, 'application/json', async (response) => {
      if ((await response.json())?.status !== 'ok') throw new Error('Unexpected health response.');
    }],
    ['spa-deep-link', '/login', 200, 'text/html', async (response) => {
      if (!(await response.text()).includes('<app-root')) throw new Error('Angular root missing.');
    }],
    ['api-json-404', '/api/production-smoke-route-that-does-not-exist', 404, 'application/json', async (response) => {
      if ((await response.json())?.error?.code !== 'route_not_found') throw new Error('Unexpected API response.');
    }],
    ['xsrf-bootstrap', '/api/v1/auth/xsrf', 204, null, async (response) => {
      const cookie = response.headers.get('set-cookie') ?? '';
      if (
        !cookie.startsWith('__Host-ff_xsrf=') ||
        !cookie.includes('Secure') ||
        !cookie.includes('Path=/') ||
        cookie.includes('HttpOnly') ||
        cookie.includes('Domain=')
      ) {
        throw new Error('Production XSRF cookie boundary mismatch.');
      }
    }],
    ['anonymous-session', '/api/v1/auth/session', 401, 'application/json'],
  ];
  for (const [name, path, status, contentType, verifyBody] of checks) {
    const response = await fetchImplementation(new URL(path, origin), { redirect: 'manual' });
    if (response.status !== status) throw new Error('Production smoke status mismatch.');
    if (contentType && !response.headers.get('content-type')?.startsWith(contentType)) {
      throw new Error('Production smoke content type mismatch.');
    }
    if (verifyBody) await verifyBody(response);
    write(`production-smoke:pass:${name}`);
  }
}

function requireOrigin(value) {
  if (!value) throw new Error('PRODUCTION_SMOKE_ORIGIN is required.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.origin !== value || url.pathname !== '/') {
    throw new Error('PRODUCTION_SMOKE_ORIGIN must be an exact HTTPS origin.');
  }
  return value;
}
