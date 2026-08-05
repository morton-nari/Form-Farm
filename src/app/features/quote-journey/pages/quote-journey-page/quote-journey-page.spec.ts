import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ApplicationDefinition } from '../../../../core/api/insurance-api.models';
import { QuoteJourneyPage } from './quote-journey-page';

describe('QuoteJourneyPage', () => {
  let fixture: ComponentFixture<QuoteJourneyPage>;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuoteJourneyPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(QuoteJourneyPage);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('shows Your Details as completed and renders every initial API question', async () => {
    await loadApplication();

    expect(heading()).toBe('About You');
    expect(inputFor('email')).toBeTruthy();
    expect(inputFor('phone')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('#question-occupation')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('input[type="radio"]')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('.completed-static')?.textContent).toContain(
      'Your Details',
    );

    const sectionLinks = fixture.nativeElement.querySelectorAll(
      '.section-link',
    ) as NodeListOf<HTMLButtonElement>;
    expect(sectionLinks).toHaveLength(2);
    expect(sectionLinks[0]?.disabled).toBe(false);
    expect(sectionLinks[0]?.classList).toContain('active');
  });

  it('blocks invalid progression and focuses the first invalid field', async () => {
    await loadApplication();

    submitCurrentSection();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(heading()).toBe('About You');
    expect(fixture.nativeElement.querySelectorAll('[role="alert"]')).toHaveLength(4);
    expect(document.activeElement?.id).toBe('question-email');
  });

  it('highlights the section being answered and presents an answer review', async () => {
    await loadApplication();

    enterValue(inputFor('email'), 'person@example.com');
    enterValue(inputFor('phone'), '0412345678');
    const occupation = fixture.nativeElement.querySelector(
      '#question-occupation',
    ) as HTMLSelectElement;
    enterValue(occupation, 'Teacher', 'change');

    const noOption = fixture.nativeElement.querySelectorAll(
      'input[type="radio"]',
    )[1] as HTMLInputElement;
    noOption.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.section-link')[1]?.classList).toContain(
      'active',
    );
    submitCurrentSection();

    expect(heading()).toBe('Ready for your quote');
    expect(reviewValues()).toEqual(['person@example.com', '0412345678', 'Teacher', 'No']);
    expect(fixture.nativeElement.querySelector('[aria-current="step"]')?.textContent).toContain(
      'Quote',
    );
  });

  it('shows a retry action when the application request fails', async () => {
    fixture.detectChanges();
    httpTesting
      .expectOne('/api/application')
      .flush('Unavailable', { status: 503, statusText: 'Service Unavailable' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(heading()).toBe('Unable to load your application');

    const retryButton = fixture.nativeElement.querySelector('.alert button') as HTMLButtonElement;
    retryButton.click();
    fixture.detectChanges();

    httpTesting.expectOne('/api/application').flush(createApplicationDefinition());
    await fixture.whenStable();
    fixture.detectChanges();
    expect(heading()).toBe('About You');
  });

  it('submits a non-smoker application and renders the returned quote', async () => {
    await loadApplication();
    completeKnownApplication('No');

    clickGetQuote();
    const quoteRequest = httpTesting.expectOne('/api/quote');
    expect(quoteRequest.request.body).toEqual({
      answers: {
        email: 'person@example.com',
        phone: '0412345678',
        occupation: 'Teacher',
        smokedLast12Months: 'No',
      },
    });
    quoteRequest.flush({
      status: 'quoted',
      quote: { product: 'Life Protect', coverAmount: 500_000, premium: 64.85 },
    });
    fixture.detectChanges();

    expect(heading()).toBe('Life Protect');
    expect(fixture.nativeElement.querySelector('.quote-summary')?.textContent).toContain('500,000');
    expect(fixture.nativeElement.querySelector('.quote-summary')?.textContent).toContain('64.85');
  });

  it('adds smoking questions and resubmits every accumulated answer', async () => {
    await loadApplication();
    completeKnownApplication('Yes');

    clickGetQuote();
    httpTesting.expectOne('/api/quote').flush({
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
    });
    fixture.detectChanges();

    expect(heading()).toBe('Smoking Details');
    const cigarettes = inputFor('cigarettesPerWeek');
    expect(cigarettes.type).toBe('number');
    enterValue(cigarettes, '20');
    submitCurrentSection();
    expect(heading()).toBe('Ready for your quote');

    clickGetQuote();
    const finalRequest = httpTesting.expectOne('/api/quote');
    expect(finalRequest.request.body).toEqual({
      answers: {
        email: 'person@example.com',
        phone: '0412345678',
        occupation: 'Teacher',
        smokedLast12Months: 'Yes',
        cigarettesPerWeek: 20,
      },
    });
    finalRequest.flush({
      status: 'quoted',
      quote: { product: 'Life Protect', coverAmount: 500_000, premium: 104.75 },
    });
    fixture.detectChanges();

    expect(heading()).toBe('Life Protect');
    expect(fixture.nativeElement.querySelector('.quote-summary')?.textContent).toContain('104.75');
  });

  it('shows a quote error and allows the same answers to be retried', async () => {
    await loadApplication();
    completeKnownApplication('No');

    clickGetQuote();
    httpTesting
      .expectOne('/api/quote')
      .flush('Unavailable', { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.alert-danger')?.textContent).toContain(
      'We could not retrieve your quote.',
    );

    clickGetQuote();
    httpTesting.expectOne('/api/quote').flush({
      status: 'quoted',
      quote: { product: 'Life Protect', coverAmount: 500_000, premium: 64.85 },
    });
    fixture.detectChanges();

    expect(heading()).toBe('Life Protect');
  });

  async function loadApplication(): Promise<void> {
    fixture.detectChanges();
    httpTesting.expectOne('/api/application').flush(createApplicationDefinition());
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function heading(): string | undefined {
    return (fixture.nativeElement.querySelector('h1') as HTMLElement | null)?.textContent?.trim();
  }

  function inputFor(questionId: string): HTMLInputElement {
    return fixture.nativeElement.querySelector(`#question-${questionId}`) as HTMLInputElement;
  }

  function enterValue(
    element: HTMLInputElement | HTMLSelectElement,
    value: string,
    eventName = 'input',
  ): void {
    element.value = value;
    element.dispatchEvent(new Event(eventName));
    fixture.detectChanges();
  }

  function submitCurrentSection(): void {
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  function completeKnownApplication(smokedLast12Months: 'Yes' | 'No'): void {
    enterValue(inputFor('email'), 'person@example.com');
    enterValue(inputFor('phone'), '0412345678');
    enterValue(
      fixture.nativeElement.querySelector('#question-occupation') as HTMLSelectElement,
      'Teacher',
      'change',
    );

    const optionIndex = smokedLast12Months === 'Yes' ? 0 : 1;
    const option = fixture.nativeElement.querySelectorAll('input[type="radio"]')[
      optionIndex
    ] as HTMLInputElement;
    option.click();
    fixture.detectChanges();
    submitCurrentSection();
    expect(heading()).toBe('Ready for your quote');
  }

  function clickGetQuote(): void {
    const button = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((candidate) => candidate.textContent?.includes('Get my quote'));
    button?.click();
    fixture.detectChanges();
  }

  function reviewValues(): string[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('.review-item dd') as NodeListOf<HTMLElement>,
    ).map((item) => item.textContent?.trim() ?? '');
  }
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
          { id: 'email', label: 'Email Address', type: 'email', required: true },
          { id: 'phone', label: 'Phone Number', type: 'text', required: true },
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
