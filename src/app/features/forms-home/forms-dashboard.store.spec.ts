import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { FormsDashboardStore } from './forms-dashboard.store';

describe('FormsDashboardStore', () => {
  let store: FormsDashboardStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FormsDashboardStore, provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(FormsDashboardStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads strict summary data without accepting definitions or extra fields', () => {
    store.load();
    http.expectOne('/api/v1/forms').flush({
      forms: [
        {
          id: 'health-check',
          title: 'Health check',
          formVersion: 2,
          updatedAt: '2026-08-14T00:00:00.000Z',
        },
      ],
    });
    expect(store.status()).toBe('loaded');
    expect(store.forms()).toHaveLength(1);

    store.load();
    http.expectOne('/api/v1/forms').flush({ forms: [], definition: { secret: true } });
    expect(store.status()).toBe('error');
  });

  it('supports empty, failure, and retry states safely', () => {
    store.load();
    http.expectOne('/api/v1/forms').flush({}, { status: 500, statusText: 'Failure' });
    expect(store.status()).toBe('error');

    store.load();
    http.expectOne('/api/v1/forms').flush({ forms: [] });
    expect(store.status()).toBe('loaded');
    expect(store.forms()).toEqual([]);
  });
});
