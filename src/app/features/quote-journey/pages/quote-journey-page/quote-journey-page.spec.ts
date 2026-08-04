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

  it('loads the schema and starts with future sections unavailable', () => {
    loadApplication();

    expect(heading()).toBe('Your Details');
    expect(inputFor('email')).toBeTruthy();
    expect(inputFor('phone')).toBeTruthy();

    const sectionLinks = fixture.nativeElement.querySelectorAll(
      '.section-link',
    ) as NodeListOf<HTMLButtonElement>;
    expect(sectionLinks).toHaveLength(2);
    expect(sectionLinks[0]?.disabled).toBe(true);
    expect(sectionLinks[1]?.disabled).toBe(true);
  });

  it('blocks invalid progression and focuses the first invalid field', async () => {
    loadApplication();

    submitCurrentSection();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(heading()).toBe('Your Details');
    expect(fixture.nativeElement.querySelectorAll('[role="alert"]')).toHaveLength(2);
    expect(document.activeElement?.id).toBe('question-email');
  });

  it('progresses through valid sections and presents an answer review', () => {
    loadApplication();

    enterValue(inputFor('email'), 'person@example.com');
    enterValue(inputFor('phone'), '0412345678');
    submitCurrentSection();

    expect(heading()).toBe('About You');
    expect(fixture.nativeElement.querySelector('.journey-stage .completed')).toBeTruthy();

    const occupation = fixture.nativeElement.querySelector(
      '#question-occupation',
    ) as HTMLSelectElement;
    enterValue(occupation, 'Teacher', 'change');
    submitCurrentSection();

    expect(heading()).toBe('Lifestyle');

    const noOption = fixture.nativeElement.querySelectorAll(
      'input[type="radio"]',
    )[1] as HTMLInputElement;
    noOption.click();
    fixture.detectChanges();
    submitCurrentSection();

    expect(heading()).toBe('Ready for your quote');
    expect(reviewValues()).toEqual(['person@example.com', '0412345678', 'Teacher', 'No']);
    expect(fixture.nativeElement.querySelector('[aria-current="step"]')?.textContent).toContain(
      'Quote',
    );
  });

  it('shows a retry action when the application request fails', () => {
    fixture.detectChanges();
    httpTesting
      .expectOne('/api/application')
      .flush('Unavailable', { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();

    expect(heading()).toBe('Unable to load your application');

    const retryButton = fixture.nativeElement.querySelector('.alert button') as HTMLButtonElement;
    retryButton.click();
    fixture.detectChanges();

    httpTesting.expectOne('/api/application').flush(createApplicationDefinition());
    fixture.detectChanges();
    expect(heading()).toBe('Your Details');
  });

  function loadApplication(): void {
    fixture.detectChanges();
    httpTesting.expectOne('/api/application').flush(createApplicationDefinition());
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
