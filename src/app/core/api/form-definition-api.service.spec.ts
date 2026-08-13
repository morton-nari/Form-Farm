import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { FormDefinitionApiService } from './form-definition-api.service';

describe('FormDefinitionApiService', () => {
  it('requests an encoded form resource and leaves its response untrusted', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(FormDefinitionApiService);
    const http = TestBed.inject(HttpTestingController);
    const candidate = { arbitrary: true };
    let response: unknown;

    service.getFormDefinition('feedback/form').subscribe((value) => (response = value));
    http.expectOne('/api/v1/forms/feedback%2Fform').flush(candidate);

    expect(response).toEqual(candidate);
    http.verify();
  });
});
