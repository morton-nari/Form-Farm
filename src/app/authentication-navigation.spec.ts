import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
  withNoXsrfProtection,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';

import { routes } from './app.routes';
import { formFarmXsrfInterceptor } from './core/api/xsrf.interceptor';
import { AuthenticationStore } from './core/auth/authentication.store';

describe('authentication navigation', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(withNoXsrfProtection(), withInterceptors([formFarmXsrfInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('shows login first for an anonymous visitor', async () => {
    const navigation = RouterTestingHarness.create('/login');
    await flushSession(401);
    const harness = await navigation;

    expect(harness.routeNativeElement?.textContent).toContain('Sign in');
    expect(harness.routeNativeElement?.textContent).toContain('Register now');
  });

  it('bypasses login for an authenticated session and shows forms navigation', async () => {
    const navigation = RouterTestingHarness.create('/login');
    await flushSession(200);
    const harness = await navigation;

    expect(TestBed.inject(Router).url).toBe('/forms');
    expect(harness.routeNativeElement?.textContent).toContain('Your forms');
    expect(harness.routeNativeElement?.textContent).toContain('Customer feedback');
  });

  it('registers through the trusted API and returns to login with safe confirmation', async () => {
    const navigation = RouterTestingHarness.create('/register');
    await flushSession(401);
    const harness = await navigation;
    const element = harness.routeNativeElement!;
    setInput(element, '#register-email', 'person@example.com');
    setInput(element, '#register-password', 'a sufficiently long password');
    setInput(element, '#confirm-password', 'a sufficiently long password');
    element.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();

    http.expectOne('/api/v1/auth/xsrf').flush(null);
    const registration = await waitForRequest('/api/v1/auth/register');
    expect(registration.request.body).toEqual({
      email: 'person@example.com',
      password: 'a sufficiently long password',
    });
    registration.flush({ accepted: true });
    await vi.waitFor(() =>
      expect(TestBed.inject(Router).url).toBe('/login?registration=accepted'),
    );
    harness.fixture.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('registration request was accepted');
  });

  it('shows a generic failed-login message without backend details', async () => {
    const navigation = RouterTestingHarness.create('/login');
    await flushSession(401);
    const harness = await navigation;
    const element = harness.routeNativeElement!;
    setInput(element, '#login-email', 'person@example.com');
    setInput(element, '#login-password', 'wrong password');
    element.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    http.expectOne('/api/v1/auth/xsrf').flush(null);
    (await waitForRequest('/api/v1/auth/login'))
      .flush('database details', { status: 401, statusText: 'Unauthorized' });
    await vi.waitFor(() => {
      harness.fixture.detectChanges();
      expect(element.textContent).toContain('The email or password is incorrect.');
    });
    expect(element.textContent).not.toContain('database details');
    await vi.waitFor(() => expect(document.activeElement?.getAttribute('role')).toBe('alert'));
  });

  it('signs in and navigates to the protected forms page', async () => {
    const navigation = RouterTestingHarness.create('/login');
    await flushSession(401);
    const harness = await navigation;
    const element = harness.routeNativeElement!;
    setInput(element, '#login-email', 'person@example.com');
    setInput(element, '#login-password', 'a sufficiently long password');
    element.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    http.expectOne('/api/v1/auth/xsrf').flush(null);
    (await waitForRequest('/api/v1/auth/login')).flush({ authenticated: true });
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/forms'));
    harness.fixture.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Your forms');
  });

  it('redirects an expired protected navigation to login with a safe return URL', async () => {
    const navigation = RouterTestingHarness.create('/forms/customer-feedback');
    await flushSession(401);
    const harness = await navigation;

    expect(TestBed.inject(Router).url).toBe('/login?returnUrl=%2Fforms%2Fcustomer-feedback');
    expect(harness.routeNativeElement?.textContent).toContain('Sign in');
    http.expectNone('/api/v1/forms/customer-feedback');
  });

  it('fails closed when the session response is malformed', async () => {
    const navigation = RouterTestingHarness.create('/forms');
    let request: TestRequest | undefined;
    await vi.waitFor(() => {
      const requests = http.match('/api/v1/auth/session');
      expect(requests).toHaveLength(1);
      request = requests[0];
    });
    request!.flush({ authenticated: true, unexpected: 'value' });
    const harness = await navigation;

    expect(TestBed.inject(Router).url).toBe('/login?returnUrl=%2Fforms');
    expect(harness.routeNativeElement?.textContent).toContain('Sign in');
  });

  it('logs out and returns to login', async () => {
    const navigation = RouterTestingHarness.create('/forms');
    await flushSession(200);
    const harness = await navigation;
    harness.routeNativeElement?.querySelector<HTMLButtonElement>('button')!.click();
    http.expectOne('/api/v1/auth/logout').flush(null);
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/login');
    expect(harness.routeNativeElement?.textContent).toContain('Sign in');
  });

  it('shares a simultaneous pre-authentication XSRF bootstrap request', async () => {
    const store = TestBed.inject(AuthenticationStore);
    const login = store.login('person@example.com', 'password');
    const registration = store.register('another@example.com', 'a sufficiently long password');

    const bootstrap = http.expectOne('/api/v1/auth/xsrf');
    bootstrap.flush(null);
    (await waitForRequest('/api/v1/auth/login')).flush({ authenticated: true });
    (await waitForRequest('/api/v1/auth/register')).flush({ accepted: true });

    await expect(login).resolves.toBe('authenticated');
    await expect(registration).resolves.toBe('accepted');
  });

  it('clears authenticated client state when a later owned API request returns 401', async () => {
    const store = TestBed.inject(AuthenticationStore);
    const bootstrap = store.bootstrap();
    await flushSession(200);
    await bootstrap;
    expect(store.status()).toBe('authenticated');

    TestBed.inject(HttpClient).get('/api/v1/forms').subscribe({ error: () => undefined });
    http
      .expectOne('/api/v1/forms')
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(store.status()).toBe('anonymous');
  });

  async function flushSession(status: 200 | 401): Promise<void> {
    let request: TestRequest | undefined;
    await vi.waitFor(() => {
      const requests = http.match('/api/v1/auth/session');
      expect(requests).toHaveLength(1);
      request = requests[0];
    });
    if (!request) throw new Error('Expected session request.');
    status === 200
      ? request.flush({ authenticated: true })
      : request.flush({}, { status: 401, statusText: 'Unauthorized' });
  }

  async function waitForRequest(url: string): Promise<TestRequest> {
    let request: TestRequest | undefined;
    await vi.waitFor(() => {
      const requests = http.match(url);
      expect(requests).toHaveLength(1);
      request = requests[0];
    });
    if (!request) throw new Error(`Expected request: ${url}`);
    return request;
  }
});

function setInput(root: HTMLElement, selector: string, value: string): void {
  const input = root.querySelector<HTMLInputElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
}
