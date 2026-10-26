export function createVercelProtectedFetch(environment, request = fetch) {
  const origin = requireExactOrigin(environment.PRODUCTION_SMOKE_ORIGIN);
  const protectionBypass = environment.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!protectionBypass) {
    throw new Error('Protected Production smoke requires VERCEL_AUTOMATION_BYPASS_SECRET.');
  }

  return async (input, options = {}) => {
    const url = new URL(input);
    if (url.origin !== origin) throw new Error('Protected Production smoke URL escaped its origin.');
    if (options.method && options.method !== 'GET') {
      throw new Error('Protected Production smoke permits GET requests only.');
    }

    const headers = new Headers(options.headers);
    headers.set('x-vercel-protection-bypass', protectionBypass);
    return request(url, { ...options, headers });
  };
}

function requireExactOrigin(value) {
  if (!value) throw new Error('PRODUCTION_SMOKE_ORIGIN is required.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.origin !== value || url.pathname !== '/') {
    throw new Error('PRODUCTION_SMOKE_ORIGIN must be an exact HTTPS origin.');
  }
  return value;
}
