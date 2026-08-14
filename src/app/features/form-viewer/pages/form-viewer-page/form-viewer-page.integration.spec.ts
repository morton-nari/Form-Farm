import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

import { FormDefinition } from '@form-farm/form-domain';
import { FormViewerPage } from './form-viewer-page';

describe('FormViewerPage integration', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormViewerPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ formId: 'customer-feedback' })) } },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('creates the app', () => {
    const fixture = TestBed.createComponent(FormViewerPage);

    fixture.detectChanges();
    httpTesting.expectOne('/api/v1/forms/customer-feedback');

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders a validated form definition from the owned API', () => {
    const fixture = TestBed.createComponent(FormViewerPage);

    fixture.detectChanges();
    httpTesting.expectOne('/api/v1/forms/customer-feedback').flush(createFormDefinition());
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Customer feedback');
    expect(compiled.querySelector('legend')?.textContent).toContain('Your experience');
  });

  it('rejects an invalid definition and retries the owned API', () => {
    const fixture = TestBed.createComponent(FormViewerPage);
    fixture.detectChanges();
    httpTesting.expectOne('/api/v1/forms/customer-feedback').flush({ title: 'Not valid' });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Unable to load this form');
    compiled.querySelector<HTMLButtonElement>('button')?.click();
    fixture.detectChanges();
    httpTesting.expectOne('/api/v1/forms/customer-feedback').flush(createFormDefinition());
    fixture.detectChanges();
    expect(compiled.textContent).toContain('Customer feedback');
  });

  it('shows a safe retry state when the owned API fails', () => {
    const fixture = TestBed.createComponent(FormViewerPage);
    fixture.detectChanges();
    httpTesting
      .expectOne('/api/v1/forms/customer-feedback')
      .flush('database details', { status: 500, statusText: 'Internal Server Error' });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('We could not load this form. Please try again.');
    expect(compiled.textContent).not.toContain('database details');
  });

  it('validates required fields, moves focus, and shows the review accessibly', async () => {
    const fixture = TestBed.createComponent(FormViewerPage);
    fixture.detectChanges();
    httpTesting.expectOne('/api/v1/forms/customer-feedback').flush(createFormDefinition());
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    fixture.detectChanges();
    await Promise.resolve();
    expect(compiled.textContent).toContain('Overall rating is required.');

    const rating = compiled.querySelector<HTMLInputElement>('input[type="radio"]')!;
    expect(document.activeElement).toBe(rating);
    rating.checked = true;
    rating.dispatchEvent(new Event('change'));
    compiled.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    fixture.detectChanges();
    await Promise.resolve();
    expect(compiled.textContent).toContain('Review your answers');
    expect(compiled.textContent).toContain('Send feedback');
    httpTesting.expectNone('/api/v1/forms/customer-feedback/submissions');
    expect(document.activeElement).toBe(compiled.querySelector('#form-title'));
  });

  it('submits provider-neutral answers once and retries safely with the same key', async () => {
    const fixture = TestBed.createComponent(FormViewerPage);
    fixture.detectChanges();
    httpTesting.expectOne('/api/v1/forms/customer-feedback').flush(createFormDefinition());
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    selectRatingAndReview(fixture, compiled, 0);

    const submit = primaryButton(compiled);
    submit.click();
    fixture.detectChanges();
    expect(submit.disabled).toBe(true);
    submit.click();

    const first = httpTesting.expectOne('/api/v1/forms/customer-feedback/submissions');
    expect(first.request.body).toEqual({ formVersion: 1, answers: { overallRating: 'good' } });
    const idempotencyKey = first.request.headers.get('Idempotency-Key');
    expect(idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    first.flush(
      {
        error: { code: 'invalid_submission', message: 'safe' },
        issues: [{ path: ['answers', 'overallRating'], code: 'invalid_option' }],
        secret: 'database details',
      },
      { status: 422, statusText: 'Unprocessable Content' },
    );
    fixture.detectChanges();
    await Promise.resolve();

    expect(compiled.textContent).toContain('We could not submit your answers. Please try again.');
    expect(compiled.textContent).not.toContain('database details');
    expect(document.activeElement).toBe(compiled.querySelector('#submission-status'));

    primaryButton(compiled).click();
    const retry = httpTesting.expectOne('/api/v1/forms/customer-feedback/submissions');
    expect(retry.request.headers.get('Idempotency-Key')).toBe(idempotencyKey);
    retry.flush({ submissionId: '550e8400-e29b-41d4-a716-446655440000', replayed: true });
    fixture.detectChanges();
    await Promise.resolve();

    expect(compiled.textContent).toContain('Response received');
    expect(compiled.textContent).toContain('Thank you.');
    expect(document.activeElement).toBe(compiled.querySelector('#submission-status'));
  });

  it('uses a new idempotency key after the reviewed answers change', () => {
    const fixture = TestBed.createComponent(FormViewerPage);
    fixture.detectChanges();
    httpTesting.expectOne('/api/v1/forms/customer-feedback').flush(createFormDefinition());
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    selectRatingAndReview(fixture, compiled, 0);
    primaryButton(compiled).click();
    const first = httpTesting.expectOne('/api/v1/forms/customer-feedback/submissions');
    const firstKey = first.request.headers.get('Idempotency-Key');
    first.flush('failure', { status: 500, statusText: 'Internal Server Error' });
    fixture.detectChanges();

    compiled.querySelector<HTMLButtonElement>('.btn-outline-secondary')!.click();
    fixture.detectChanges();
    selectRatingAndReview(fixture, compiled, 1);
    primaryButton(compiled).click();
    const changed = httpTesting.expectOne('/api/v1/forms/customer-feedback/submissions');
    expect(changed.request.body).toEqual({ formVersion: 1, answers: { overallRating: 'bad' } });
    expect(changed.request.headers.get('Idempotency-Key')).not.toBe(firstKey);
    changed.flush({ submissionId: '550e8400-e29b-41d4-a716-446655440001', replayed: false });
  });
});

function primaryButton(compiled: HTMLElement): HTMLButtonElement {
  return compiled.querySelector<HTMLButtonElement>('.btn-primary')!;
}

function selectRatingAndReview(
  fixture: ComponentFixture<FormViewerPage>,
  compiled: HTMLElement,
  optionIndex: number,
): void {
  const rating = compiled.querySelectorAll<HTMLInputElement>('input[type="radio"]')[optionIndex];
  rating.checked = true;
  rating.dispatchEvent(new Event('change'));
  primaryButton(compiled).click();
  fixture.detectChanges();
}

function createFormDefinition(): FormDefinition {
  return {
    schemaVersion: 1,
    id: 'customer-feedback',
    formVersion: 1,
    title: 'Customer feedback',
    sections: [
      {
        id: 'experience',
        title: 'Your experience',
        fields: [
          {
            id: 'overallRating',
            label: 'Overall rating',
            type: 'radio',
            options: [
              { label: 'Good', value: 'good' },
              { label: 'Bad', value: 'bad' },
            ],
            validation: [{ type: 'required' }],
          },
        ],
      },
    ],
    submission: { submitLabel: 'Send feedback', successMessage: 'Thank you.' },
  };
}
