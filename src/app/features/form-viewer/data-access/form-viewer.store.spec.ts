import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FormDefinition } from '@form-farm/form-domain';

import { FormViewerStore } from './form-viewer.store';

describe('FormViewerStore submissions', () => {
  let store: FormViewerStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(FormViewerStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reuses one key for logically identical answers regardless of object key order', () => {
    store.submit(definition(), { second: 'two', first: 'one' });
    const first = http.expectOne('/api/v1/forms/customer-feedback/submissions');
    const key = first.request.headers.get('Idempotency-Key');
    first.flush('offline', { status: 503, statusText: 'Unavailable' });

    store.submit(definition(), { first: 'one', second: 'two' });
    const retry = http.expectOne('/api/v1/forms/customer-feedback/submissions');
    expect(retry.request.headers.get('Idempotency-Key')).toBe(key);
    retry.flush({ submissionId: validSubmissionId(), replayed: true });
  });

  it('rejects malformed success responses and suppresses resubmission after valid success', () => {
    store.submit(definition(), { first: 'one' });
    http
      .expectOne('/api/v1/forms/customer-feedback/submissions')
      .flush({ submissionId: validSubmissionId(), replayed: false, unexpected: true });
    expect(store.submissionStatus()).toBe('error');

    store.submit(definition(), { first: 'one' });
    http
      .expectOne('/api/v1/forms/customer-feedback/submissions')
      .flush({ submissionId: 'not-a-uuid', replayed: false });
    expect(store.submissionStatus()).toBe('error');

    store.submit(definition(), { first: 'one' });
    http
      .expectOne('/api/v1/forms/customer-feedback/submissions')
      .flush({ submissionId: validSubmissionId(), replayed: false });
    expect(store.submissionStatus()).toBe('success');

    store.submit(definition(), { first: 'one' });
    http.expectNone('/api/v1/forms/customer-feedback/submissions');
  });

  it('cancels and clears the submission attempt when another form is loaded', () => {
    store.submit(definition(), { first: 'one' });
    const pending = http.expectOne('/api/v1/forms/customer-feedback/submissions');
    const firstKey = pending.request.headers.get('Idempotency-Key');

    store.load('another-form');
    expect(pending.cancelled).toBe(true);
    http.expectOne('/api/v1/forms/another-form').flush({ invalid: true });

    store.submit(definition('another-form', 2), { first: 'one' });
    const next = http.expectOne('/api/v1/forms/another-form/submissions');
    expect(next.request.headers.get('Idempotency-Key')).not.toBe(firstKey);
    next.flush({ submissionId: validSubmissionId(), replayed: false });
  });
});

function definition(id = 'customer-feedback', formVersion = 1): FormDefinition {
  return {
    schemaVersion: 1,
    id,
    formVersion,
    title: 'Test',
    sections: [],
    submission: { submitLabel: 'Submit', successMessage: 'Done' },
  };
}

function validSubmissionId(): string {
  return '550e8400-e29b-41d4-a716-446655440000';
}
