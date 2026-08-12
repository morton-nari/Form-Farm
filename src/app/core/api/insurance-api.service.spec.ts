import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ApplicationDefinition, QuoteAnswers, QuoteResponse } from './insurance-api.models';
import { InsuranceApiService } from './insurance-api.service';

describe('InsuranceApiService', () => {
  let service: InsuranceApiService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [InsuranceApiService, provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(InsuranceApiService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('gets the application definition from the proxied endpoint', () => {
    const application: ApplicationDefinition = {
      id: '1',
      title: 'Life Insurance Application',
      pages: [
        {
          id: 'about-you',
          title: 'About You',
          questions: [
            {
              id: 'email',
              label: 'Email Address',
              type: 'email',
              required: true,
            },
          ],
        },
      ],
    };

    service.getApplication().subscribe((response) => {
      expect(response).toEqual(application);
    });

    const request = httpTesting.expectOne('/api/application');

    expect(request.request.method).toBe('GET');
    request.flush(application);
  });

  it('wraps answers when requesting a quote', () => {
    const answers: QuoteAnswers = {
      email: 'assessment.test@example.com',
      phone: '0412345678',
      occupation: 'Accountant',
      smokedLast12Months: 'No',
    };
    const response: QuoteResponse = {
      status: 'quoted',
      quote: {
        product: 'Life Protect',
        coverAmount: 500_000,
        premium: 64.85,
      },
    };

    service.submitQuote(answers).subscribe((quoteResponse) => {
      expect(quoteResponse).toEqual(response);
    });

    const request = httpTesting.expectOne('/api/quote');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ answers });
    request.flush(response);
  });

  it('supports an additional-questions response', () => {
    const response: QuoteResponse = {
      status: 'additionalQuestionsRequired',
      pages: [
        {
          id: 'smoking-details',
          title: 'Smoking Details',
          questions: [
            {
              id: 'cigarettesPerWeek',
              label: 'How many cigarettes do you smoke each week?',
              type: 'number',
              required: true,
            },
          ],
        },
      ],
    };

    service.submitQuote({ smokedLast12Months: 'Yes' }).subscribe((quoteResponse) => {
      expect(quoteResponse).toEqual(response);
    });

    const request = httpTesting.expectOne('/api/quote');

    request.flush(response);
  });
});
