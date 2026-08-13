import { DOCUMENT } from '@angular/common';
import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
  withNoXsrfProtection,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AuthenticationApiService } from './authentication-api.service';
import { formFarmXsrfInterceptor, readXsrfToken } from './xsrf.interceptor';

describe('readXsrfToken', () => {
  it('supports production and development owned cookie names', () => {
    expect(readXsrfToken('__Host-ff_xsrf=production-token; other=value')).toBe('production-token');
    expect(readXsrfToken('ff_xsrf=development-token')).toBe('development-token');
  });

  it('does not read session or unrelated cookies', () => {
    expect(readXsrfToken('ff_session=secret; unrelated=value')).toBeUndefined();
    expect(readXsrfToken('ff_xsrf=%invalid')).toBe('');
  });

  it('adds only the readable XSRF value to unsafe owned API requests', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withNoXsrfProtection(), withInterceptors([formFarmXsrfInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(DOCUMENT).cookie = 'ff_xsrf=owned-xsrf-token; Path=/';
    const api = TestBed.inject(AuthenticationApiService);
    const http = TestBed.inject(HttpTestingController);

    api.login('person@example.com', 'password').subscribe();
    const request = http.expectOne('/api/v1/auth/login');
    expect(request.request.headers.get('X-XSRF-TOKEN')).toBe('owned-xsrf-token');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({ authenticated: true });
    http.verify();
  });

  it('never adds the token to safe methods or external and non-API URLs', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withNoXsrfProtection(), withInterceptors([formFarmXsrfInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(DOCUMENT).cookie = 'ff_xsrf=owned-xsrf-token; Path=/';
    const client = TestBed.inject(HttpClient);
    const http = TestBed.inject(HttpTestingController);

    client.get('/api/v1/forms').subscribe();
    client.head('/api/v1/forms').subscribe();
    client.post('https://example.com/api/v1/forms', {}).subscribe();
    client.post('/not-api/forms', {}).subscribe();

    for (const request of http.match(() => true)) {
      expect(request.request.headers.has('X-XSRF-TOKEN')).toBe(false);
      request.flush(null);
    }
    http.verify();
  });
});
