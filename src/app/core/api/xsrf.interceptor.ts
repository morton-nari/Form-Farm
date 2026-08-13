import { DOCUMENT } from '@angular/common';
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

const XSRF_COOKIE_NAMES = ['__Host-ff_xsrf', 'ff_xsrf'] as const;

export const formFarmXsrfInterceptor: HttpInterceptorFn = (request, next) => {
  if (!isUnsafeOwnedApiRequest(request.method, request.url)) return next(request);
  const token = readXsrfToken(inject(DOCUMENT).cookie);
  return next(token ? request.clone({ setHeaders: { 'X-XSRF-TOKEN': token } }) : request);
};

export function readXsrfToken(cookieHeader: string): string | undefined {
  const cookies = new Map(
    cookieHeader
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf('=');
        return separator < 0
          ? [part, '']
          : [part.slice(0, separator), safelyDecode(part.slice(separator + 1))];
      }),
  );
  return XSRF_COOKIE_NAMES.map((name) => cookies.get(name)).find(
    (value): value is string => value !== undefined,
  );
}

function safelyDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

function isUnsafeOwnedApiRequest(method: string, url: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase()) && url.startsWith('/api/');
}
