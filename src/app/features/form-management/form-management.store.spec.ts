import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FormManagementStore } from './form-management.store';

describe('FormManagementStore', () => {
  let store: FormManagementStore;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FormManagementStore, provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(FormManagementStore);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('accepts exact lifecycle summaries and pagination cursor', () => {
    store.load();
    http
      .expectOne(
        (request) =>
          request.url === '/api/v1/management/forms' && request.params.get('limit') === '20',
      )
      .flush({
        forms: [
          {
            id: 'my-form',
            title: 'My form',
            status: 'draft',
            latestVersion: 0,
            currentPublishedVersion: null,
            draftRevision: 1,
            updatedAt: '2026-08-14T00:00:00.000Z',
          },
        ],
        nextCursor: 'cursor',
      });
    expect(store.status()).toBe('loaded');
    expect(store.forms()[0].id).toBe('my-form');
    expect(store.nextCursor()).toBe('cursor');
  });

  it('fails closed for extra fields or malformed lifecycle data', () => {
    store.load();
    http
      .expectOne((request) => request.url === '/api/v1/management/forms')
      .flush({
        forms: [
          {
            id: 'my-form',
            title: 'My form',
            status: 'unknown',
            latestVersion: 0,
            currentPublishedVersion: null,
            draftRevision: 1,
            updatedAt: '2026-08-14T00:00:00.000Z',
            ownerId: 'secret',
          },
        ],
        nextCursor: null,
      });
    expect(store.status()).toBe('error');
  });
});
