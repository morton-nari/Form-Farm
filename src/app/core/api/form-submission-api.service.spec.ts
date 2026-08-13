import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { FormSubmissionApiService } from './form-submission-api.service';

describe('FormSubmissionApiService', () => {
  it('posts provider-neutral answers and leaves the response untrusted', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(FormSubmissionApiService);
    const http = TestBed.inject(HttpTestingController);
    const candidate = { submissionId: 'submission-id', replayed: false };
    let response: unknown;

    service
      .submit('feedback/form', 3, { rating: 'good' }, '550e8400-e29b-41d4-a716-446655440000')
      .subscribe((value) => (response = value));

    const request = http.expectOne('/api/v1/forms/feedback%2Fform/submissions');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ formVersion: 3, answers: { rating: 'good' } });
    expect(request.request.headers.get('Idempotency-Key')).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    );
    request.flush(candidate);
    expect(response).toEqual(candidate);
    http.verify();
  });
});
