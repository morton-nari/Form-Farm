import { randomBytes } from 'node:crypto';

const SESSION_COOKIE = '__Host-ff_session';
const XSRF_COOKIE = '__Host-ff_xsrf';

export function createSmokeReporter(write = (line) => process.stdout.write(`${line}\n`)) {
  return {
    passed(check) {
      write(`smoke:pass:${check}`);
    },
    failed(check) {
      write(`smoke:fail:${check}`);
    },
  };
}

export async function runDeployedSmoke(environment, fetchImplementation = fetch, reporter = createSmokeReporter()) {
  const origin = requireHttpsOrigin(environment.SMOKE_ORIGIN);
  const email = requireSmokeEmail(environment.SMOKE_ACCOUNT_EMAIL);
  const bypass = requireValue(environment.SMOKE_PROTECTION_BYPASS, 'SMOKE_PROTECTION_BYPASS');
  const password = `Ff!${randomBytes(24).toString('base64url')}`;
  const cookies = new Map();

  const request = async (check, path, options = {}) => {
    try {
      const headers = new Headers(options.headers);
      headers.set('x-vercel-protection-bypass', bypass);
      if (cookies.size > 0) {
        headers.set(
          'cookie',
          [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; '),
        );
      }
      const response = await fetchImplementation(new URL(path, origin), {
        ...options,
        headers,
        redirect: 'manual',
      });
      applyResponseCookies(response, cookies);
      return response;
    } catch {
      reporter.failed(check);
      throw new Error(`Smoke check failed: ${check}`);
    }
  };

  const expect = async (check, operation) => {
    try {
      await operation();
      reporter.passed(check);
    } catch {
      reporter.failed(check);
      throw new Error(`Smoke check failed: ${check}`);
    }
  };

  await expect('health', async () => {
    const response = await request('health', '/health');
    assertStatus(response, 200);
    assertContentType(response, 'application/json');
    const body = await response.json();
    if (body?.status !== 'ok') throw new Error('Unexpected health response.');
  });

  await expect('spa-deep-link', async () => {
    const response = await request('spa-deep-link', '/login');
    assertStatus(response, 200);
    assertContentType(response, 'text/html');
    if (!(await response.text()).includes('<app-root')) throw new Error('Angular root not found.');
  });

  await expect('api-json-404', async () => {
    const response = await request('api-json-404', '/api/smoke-route-that-does-not-exist');
    assertStatus(response, 404);
    assertContentType(response, 'application/json');
    const body = await response.json();
    if (body?.error?.code !== 'route_not_found') throw new Error('Unexpected API error.');
  });

  const bootstrapXsrf = async (check) => {
    const response = await request(check, '/api/v1/auth/xsrf');
    assertStatus(response, 204);
    const cookie = requireCookie(response, XSRF_COOKIE);
    assertCookieFlags(cookie, ['Secure', 'SameSite=Lax', 'Path=/'], ['HttpOnly', 'Domain=']);
    const token = cookies.get(XSRF_COOKIE);
    if (!token) throw new Error('XSRF cookie missing.');
    return token;
  };

  const initialXsrf = await bootstrapXsrf('xsrf-bootstrap');
  reporter.passed('xsrf-bootstrap');

  await expect('registration', async () => {
    const response = await request('registration', '/api/v1/auth/register', {
      method: 'POST',
      headers: unsafeHeaders(origin, initialXsrf),
      body: JSON.stringify({ email, password }),
    });
    assertStatus(response, 202);
  });

  const loginXsrf = await bootstrapXsrf('xsrf-before-login');
  reporter.passed('xsrf-before-login');
  await expect('login-cookie', async () => {
    const response = await request('login-cookie', '/api/v1/auth/login', {
      method: 'POST',
      headers: unsafeHeaders(origin, loginXsrf),
      body: JSON.stringify({ email, password }),
    });
    assertStatus(response, 200);
    const sessionCookie = requireCookie(response, SESSION_COOKIE);
    assertCookieFlags(
      sessionCookie,
      ['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/'],
      ['Domain='],
    );
    if (!cookies.has(SESSION_COOKIE)) throw new Error('Session cookie missing.');
  });

  const rotatedXsrf = cookies.get(XSRF_COOKIE);
  await expect('xsrf-rotation', async () => {
    if (!rotatedXsrf || rotatedXsrf === loginXsrf) throw new Error('XSRF token was not rotated.');
  });

  await expect('session-bootstrap', async () => {
    const response = await request('session-bootstrap', '/api/v1/auth/session');
    assertStatus(response, 200);
    const body = await response.json();
    if (body?.authenticated !== true) throw new Error('Session is not authenticated.');
  });

  await expect('missing-xsrf-rejected', async () => {
    const response = await request('missing-xsrf-rejected', '/api/v1/auth/logout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: '{}',
    });
    assertStatus(response, 403);
  });

  await expect('incorrect-xsrf-rejected', async () => {
    const response = await request('incorrect-xsrf-rejected', '/api/v1/auth/logout', {
      method: 'POST',
      headers: unsafeHeaders(origin, 'incorrect-smoke-token'),
      body: '{}',
    });
    assertStatus(response, 403);
  });

  await expect('wrong-origin-rejected', async () => {
    const response = await request('wrong-origin-rejected', '/api/v1/auth/logout', {
      method: 'POST',
      headers: unsafeHeaders('https://wrong-origin.example', rotatedXsrf),
      body: '{}',
    });
    assertStatus(response, 403);
  });

  await expect('database-backed-management', async () => {
    const response = await request(
      'database-backed-management',
      '/api/v1/management/forms?limit=1',
    );
    assertStatus(response, 200);
    assertContentType(response, 'application/json');
  });

  await expect('logout-clears-session', async () => {
    const response = await request('logout-clears-session', '/api/v1/auth/logout', {
      method: 'POST',
      headers: unsafeHeaders(origin, rotatedXsrf),
      body: '{}',
    });
    assertStatus(response, 204);
    const sessionCookie = requireCookie(response, SESSION_COOKIE);
    assertCookieFlags(sessionCookie, ['Max-Age=0', 'Secure', 'Path=/'], ['Domain=']);
    if (cookies.has(SESSION_COOKIE)) throw new Error('Session cookie was not cleared.');
  });

  await expect('logged-out-session-rejected', async () => {
    const session = await request('logged-out-session-rejected', '/api/v1/auth/session');
    assertStatus(session, 401);
    const management = await request(
      'logged-out-session-rejected',
      '/api/v1/management/forms?limit=1',
    );
    assertStatus(management, 401);
  });
}

function requireHttpsOrigin(value) {
  const origin = requireValue(value, 'SMOKE_ORIGIN');
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin || url.pathname !== '/') {
    throw new Error('SMOKE_ORIGIN must be an exact HTTPS origin.');
  }
  return origin;
}

function requireSmokeEmail(value) {
  const email = requireValue(value, 'SMOKE_ACCOUNT_EMAIL').toLowerCase();
  if (!/^form-farm-smoke-[0-9]+-[0-9]+@example\.invalid$/.test(email)) {
    throw new Error('SMOKE_ACCOUNT_EMAIL must use the reserved synthetic pattern.');
  }
  return email;
}

function requireValue(value, name) {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function unsafeHeaders(origin, token) {
  return {
    'content-type': 'application/json',
    origin,
    'x-xsrf-token': token,
  };
}

function assertStatus(response, expected) {
  if (response.status !== expected) throw new Error('Unexpected response status.');
}

function assertContentType(response, expected) {
  if (!response.headers.get('content-type')?.startsWith(expected)) {
    throw new Error('Unexpected response content type.');
  }
}

function applyResponseCookies(response, cookies) {
  for (const header of getSetCookieHeaders(response)) {
    const [pair, ...attributes] = header.split(';').map((part) => part.trim());
    const separator = pair.indexOf('=');
    if (separator < 1) continue;
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    const cleared = attributes.some((attribute) => attribute.toLowerCase() === 'max-age=0');
    if (cleared || value.length === 0) cookies.delete(name);
    else cookies.set(name, value);
  }
}

function requireCookie(response, name) {
  const cookie = getSetCookieHeaders(response).find((header) => header.startsWith(`${name}=`));
  if (!cookie) throw new Error('Expected cookie missing.');
  return cookie;
}

function assertCookieFlags(cookie, required, forbidden) {
  for (const flag of required) {
    if (!cookie.includes(flag)) throw new Error('Required cookie attribute missing.');
  }
  for (const flag of forbidden) {
    if (cookie.includes(flag)) throw new Error('Forbidden cookie attribute present.');
  }
}

function getSetCookieHeaders(response) {
  if (typeof response.headers.getSetCookie === 'function') return response.headers.getSetCookie();
  const header = response.headers.get('set-cookie');
  return header ? [header] : [];
}
