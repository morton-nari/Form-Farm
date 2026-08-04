import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { vi } from 'vitest';

import { ApplicationDefinition } from '../../../core/api/insurance-api.models';
import { InsuranceApiService } from '../../../core/api/insurance-api.service';
import { QuoteJourneyStore } from './quote-journey.store';

describe('QuoteJourneyStore', () => {
  let applicationResponse: Subject<ApplicationDefinition>;
  let store: QuoteJourneyStore;

  beforeEach(() => {
    applicationResponse = new Subject<ApplicationDefinition>();

    TestBed.configureTestingModule({
      providers: [
        QuoteJourneyStore,
        {
          provide: InsuranceApiService,
          useValue: {
            getApplication: vi.fn(() => applicationResponse.asObservable()),
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
    expect(store.sections().map((section) => section.id)).toEqual([
      'your-details',
      'about-you',
      'lifestyle',
    ]);
    expect(store.activeSection()?.id).toBe('your-details');
    expect(store.activeStage()).toBe('your-details');
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

    expect(store.hasPreviousSection()).toBe(false);
    expect(store.hasNextSection()).toBe(true);
    expect(store.goToNextSection()).toBe(true);
    expect(store.activeSection()?.id).toBe('about-you');
    expect(store.activeStage()).toBe('application');
    expect(store.hasPreviousSection()).toBe(true);

    expect(store.goToSection(2)).toBe(true);
    expect(store.activeSection()?.id).toBe('lifestyle');
    expect(store.hasNextSection()).toBe(false);

    expect(store.goToNextSection()).toBe(false);
    expect(store.goToSection(-1)).toBe(false);
    expect(store.goToSection(1.5)).toBe(false);
    expect(store.activeSection()?.id).toBe('lifestyle');

    expect(store.goToPreviousSection()).toBe(true);
    expect(store.activeSection()?.id).toBe('about-you');
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
