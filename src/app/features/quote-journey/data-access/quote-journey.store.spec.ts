import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { vi } from 'vitest';

import { ApplicationDefinition, QuoteResponse } from '../../../core/api/insurance-api.models';
import { InsuranceApiService } from '../../../core/api/insurance-api.service';
import { QuoteJourneyStore } from './quote-journey.store';

describe('QuoteJourneyStore', () => {
  let applicationResponse: Subject<ApplicationDefinition>;
  let quoteResponse: Subject<QuoteResponse>;
  let store: QuoteJourneyStore;

  beforeEach(() => {
    applicationResponse = new Subject<ApplicationDefinition>();
    quoteResponse = new Subject<QuoteResponse>();

    TestBed.configureTestingModule({
      providers: [
        QuoteJourneyStore,
        {
          provide: InsuranceApiService,
          useValue: {
            getApplication: vi.fn(() => applicationResponse.asObservable()),
            submitQuote: vi.fn(() => quoteResponse.asObservable()),
          },
        },
      ],
    });

    store = TestBed.inject(QuoteJourneyStore);
  });

  it('loads and adapts the application into readonly signal state', () => {
    store.loadApplication();

    expect(store.loadStatus()).toBe('loading');
    expect(store.errorMessage()).toBeNull();

    applicationResponse.next(createApplicationDefinition());
    applicationResponse.complete();

    expect(store.loadStatus()).toBe('loaded');
    expect(store.sections().map((section) => section.id)).toEqual(['about-you', 'lifestyle']);
    expect(store.activeSection()?.id).toBe('about-you');
  });

  it('exposes a retry-friendly error state when loading fails', () => {
    store.loadApplication();

    applicationResponse.error(new Error('Network unavailable'));

    expect(store.loadStatus()).toBe('error');
    expect(store.journey()).toBeNull();
    expect(store.sections()).toEqual([]);
    expect(store.errorMessage()).toBe('We could not load the application. Please try again.');
  });

  it('navigates between valid sections and rejects invalid indexes', () => {
    store.loadApplication();
    applicationResponse.next(createApplicationDefinition());

    expect(store.goToSection(1)).toBe(true);
    expect(store.activeSection()?.id).toBe('lifestyle');

    expect(store.goToSection(-1)).toBe(false);
    expect(store.goToSection(1.5)).toBe(false);
    expect(store.activeSection()?.id).toBe('lifestyle');

    expect(store.goToSection(0)).toBe(true);
    expect(store.activeSection()?.id).toBe('about-you');
  });

  it('exposes submission state and stores a returned quote', () => {
    store.loadApplication();
    applicationResponse.next(createApplicationDefinition());

    expect(store.submitQuote({ smokedLast12Months: 'No' })).toBe(true);
    expect(store.submissionStatus()).toBe('submitting');
    expect(store.submitQuote({ smokedLast12Months: 'No' })).toBe(false);

    quoteResponse.next({
      status: 'quoted',
      quote: { product: 'Life Protect', coverAmount: 500_000, premium: 64.85 },
    });

    expect(store.submissionStatus()).toBe('quoted');
    expect(store.quote()).toEqual({
      product: 'Life Protect',
      coverAmount: 500_000,
      premium: 64.85,
    });
  });

  it('appends and activates additional question pages without duplicates', () => {
    store.loadApplication();
    applicationResponse.next(createApplicationDefinition());
    store.submitQuote({ smokedLast12Months: 'Yes' });

    const additionalQuestionsResponse: QuoteResponse = {
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
    quoteResponse.next(additionalQuestionsResponse);

    expect(store.submissionStatus()).toBe('additional-questions');
    expect(store.sections().map((section) => section.id)).toEqual([
      'about-you',
      'lifestyle',
      'smoking-details',
    ]);
    expect(store.activeSection()?.id).toBe('smoking-details');

    store.submitQuote({ smokedLast12Months: 'Yes', cigarettesPerWeek: 20 });
    quoteResponse.next(additionalQuestionsResponse);
    expect(store.sections()).toHaveLength(3);
  });

  it('exposes a retryable quote error', () => {
    store.loadApplication();
    applicationResponse.next(createApplicationDefinition());
    store.submitQuote({ smokedLast12Months: 'No' });

    quoteResponse.error(new Error('Quote unavailable'));

    expect(store.submissionStatus()).toBe('error');
    expect(store.quote()).toBeNull();
    expect(store.submissionError()).toBe('We could not retrieve your quote. Please try again.');
  });
});

function createApplicationDefinition(): ApplicationDefinition {
  return {
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
          {
            id: 'phone',
            label: 'Phone Number',
            type: 'text',
            required: true,
          },
          {
            id: 'occupation',
            label: 'Occupation',
            type: 'select',
            required: true,
            options: ['Accountant', 'Teacher', 'Builder', 'Pilot', 'Other'],
          },
        ],
      },
      {
        id: 'lifestyle',
        title: 'Lifestyle',
        questions: [
          {
            id: 'smokedLast12Months',
            label: 'Have you smoked in the last 12 months?',
            type: 'radio',
            required: true,
            options: ['Yes', 'No'],
          },
        ],
      },
    ],
  };
}
