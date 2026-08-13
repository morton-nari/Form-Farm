import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { FormDefinition } from './domain/forms/form-definition.models';
import { App } from './app';

describe('App', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('creates the app', () => {
    const fixture = TestBed.createComponent(App);

    fixture.detectChanges();
    httpTesting.expectOne('/api/v1/forms/customer-feedback');

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders a validated form definition from the owned API', () => {
    const fixture = TestBed.createComponent(App);

    fixture.detectChanges();
    httpTesting.expectOne('/api/v1/forms/customer-feedback').flush(createFormDefinition());
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Customer feedback');
    expect(compiled.querySelector('legend')?.textContent).toContain('Your experience');
  });

  it('rejects an invalid definition and retries the owned API', () => {
    const fixture = TestBed.createComponent(App);
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
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    httpTesting
      .expectOne('/api/v1/forms/customer-feedback')
      .flush('database details', { status: 500, statusText: 'Internal Server Error' });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('We could not load this form. Please try again.');
    expect(compiled.textContent).not.toContain('database details');
  });

  it('validates required fields before showing the review', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    httpTesting.expectOne('/api/v1/forms/customer-feedback').flush(createFormDefinition());
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    fixture.detectChanges();
    expect(compiled.textContent).toContain('Overall rating is required.');

    const rating = compiled.querySelector<HTMLInputElement>('input[type="radio"]')!;
    rating.checked = true;
    rating.dispatchEvent(new Event('change'));
    compiled.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    fixture.detectChanges();
    expect(compiled.textContent).toContain('Review your answers');
    expect(compiled.textContent).toContain('This preview does not send or store answers yet.');
  });
});

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
            options: [{ label: 'Good', value: 'good' }],
            validation: [{ type: 'required' }],
          },
        ],
      },
    ],
    submission: { submitLabel: 'Send feedback', successMessage: 'Thank you.' },
  };
}
