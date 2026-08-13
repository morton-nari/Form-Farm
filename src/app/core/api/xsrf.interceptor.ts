import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject, Injector } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { AuthenticationStore } from '../auth/authentication.store';

const XSRF_COOKIE_NAMES = ['__Host-ff_xsrf', 'ff_xsrf'] as const;

export const formFarmXsrfInterceptor: HttpInterceptorFn = (request, next) => {
  const injector = inject(Injector);
  let outgoing = request;
  if (isUnsafeOwnedApiRequest(request.method, request.url)) {
    const token = readXsrfToken(inject(DOCUMENT).cookie);
    if (token) outgoing = request.clone({ setHeaders: { 'X-XSRF-TOKEN': token } });
  }
  return next(outgoing).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        isOwnedApiUrl(request.url)
      ) {
        // Resolve lazily after HttpClient construction to avoid coupling the store to its interceptor.
        injector.get(AuthenticationStore).invalidateSession();
      }
      return throwError(() => error);
    }),
  );
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
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase()) && isOwnedApiUrl(url);
}

function isOwnedApiUrl(url: string): boolean {
  return url.startsWith('/api/');
}
