export async function runProductionSmoke(environment, fetchImplementation = fetch, write = console.log) {
  const origin = requireOrigin(environment.PRODUCTION_SMOKE_ORIGIN);
  const invalidSessionCredential = 'form-farm-production-smoke-invalid-session-credential-never-generated';
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
    [
      'runtime-database-read',
      '/api/v1/auth/session',
      401,
      'application/json',
      undefined,
      { headers: { cookie: `__Host-ff_session=${invalidSessionCredential}` } },
    ],
  ];
  for (const [name, path, status, contentType, verifyBody, requestOptions = {}] of checks) {
    let response;
    try {
      response = await fetchImplementation(new URL(path, origin), {
        ...requestOptions,
        redirect: 'manual',
      });
    } catch {
      throw new ProductionSmokeFailure(name, 'transport');
    }
    if (response.status !== status) {
      const actualStatus = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599
        ? response.status
        : 'invalid';
      throw new ProductionSmokeFailure(name, `status-${actualStatus}`);
    }
    if (contentType && !response.headers.get('content-type')?.startsWith(contentType)) {
      throw new ProductionSmokeFailure(name, 'content-type');
    }
    if (verifyBody) {
      try {
        await verifyBody(response);
      } catch {
        throw new ProductionSmokeFailure(name, 'response');
      }
    }
    write(`production-smoke:pass:${name}`);
  }
}

export class ProductionSmokeFailure extends Error {
  constructor(check, reason) {
    super(`production-smoke:failed:${check}:${reason}`);
    this.name = 'ProductionSmokeFailure';
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
