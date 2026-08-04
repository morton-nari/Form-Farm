import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, take } from 'rxjs';

import { InsuranceApiService } from '../../../core/api/insurance-api.service';
import { ApplicationPage, Quote, QuoteAnswers } from '../../../core/api/insurance-api.models';
import {
  JourneyDefinition,
  JourneyLoadStatus,
  JourneyStage,
  QuoteSubmissionStatus,
} from '../models/journey.models';
import {
  adaptAdditionalPagesToSections,
  adaptApplicationToJourney,
} from './journey-schema.adapter';

@Injectable({ providedIn: 'root' })
export class QuoteJourneyStore {
  private readonly api = inject(InsuranceApiService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly journeyState = signal<JourneyDefinition | null>(null);
  private readonly activeSectionIndexState = signal(0);
  private readonly loadStatusState = signal<JourneyLoadStatus>('idle');
  private readonly errorMessageState = signal<string | null>(null);
  private readonly submissionStatusState = signal<QuoteSubmissionStatus>('idle');
  private readonly submissionErrorState = signal<string | null>(null);
  private readonly quoteState = signal<Quote | null>(null);
  private loadSubscription?: Subscription;
  private submitSubscription?: Subscription;

  readonly journey = this.journeyState.asReadonly();
  readonly sections = computed(() => this.journeyState()?.sections ?? []);
  readonly activeSectionIndex = this.activeSectionIndexState.asReadonly();
  readonly loadStatus = this.loadStatusState.asReadonly();
  readonly errorMessage = this.errorMessageState.asReadonly();
  readonly submissionStatus = this.submissionStatusState.asReadonly();
  readonly submissionError = this.submissionErrorState.asReadonly();
  readonly quote = this.quoteState.asReadonly();

  readonly activeSection = computed(() => this.sections()[this.activeSectionIndexState()] ?? null);
  readonly activeStage = computed<JourneyStage>(
    () => this.activeSection()?.stage ?? 'your-details',
  );
  readonly hasPreviousSection = computed(() => this.activeSectionIndexState() > 0);
  readonly hasNextSection = computed(
    () => this.activeSectionIndexState() < this.sections().length - 1,
  );

  loadApplication(): void {
    this.loadSubscription?.unsubscribe();
    this.submitSubscription?.unsubscribe();
    this.loadStatusState.set('loading');
    this.errorMessageState.set(null);
    this.submissionStatusState.set('idle');
    this.submissionErrorState.set(null);
    this.quoteState.set(null);

    this.loadSubscription = this.api
      .getApplication()
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (application) => {
          this.journeyState.set(adaptApplicationToJourney(application));
          this.activeSectionIndexState.set(0);
          this.loadStatusState.set('loaded');
        },
        error: () => {
          this.journeyState.set(null);
          this.activeSectionIndexState.set(0);
          this.loadStatusState.set('error');
          this.errorMessageState.set('We could not load the application. Please try again.');
        },
      });
  }

  goToSection(index: number): boolean {
    if (!Number.isInteger(index) || index < 0 || index >= this.sections().length) {
      return false;
    }

    this.activeSectionIndexState.set(index);
    return true;
  }

  goToNextSection(): boolean {
    return this.goToSection(this.activeSectionIndexState() + 1);
  }

  goToPreviousSection(): boolean {
    return this.goToSection(this.activeSectionIndexState() - 1);
  }

  submitQuote(answers: QuoteAnswers): boolean {
    if (this.submissionStatusState() === 'submitting') {
      return false;
    }

    this.submitSubscription?.unsubscribe();
    this.submissionStatusState.set('submitting');
    this.submissionErrorState.set(null);

    this.submitSubscription = this.api
      .submitQuote(answers)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          if (response.status === 'quoted') {
            this.quoteState.set(response.quote);
            this.submissionStatusState.set('quoted');
            return;
          }

          this.appendAdditionalPages(response.pages);
          this.submissionStatusState.set('additional-questions');
        },
        error: () => {
          this.submissionStatusState.set('error');
          this.submissionErrorState.set('We could not retrieve your quote. Please try again.');
        },
      });

    return true;
  }

  private appendAdditionalPages(pages: readonly ApplicationPage[]): void {
    const journey = this.journeyState();

    if (!journey) {
      return;
    }

    const existingSectionIds = new Set(journey.sections.map((section) => section.id));
    const additionalSections = adaptAdditionalPagesToSections(pages).filter(
      (section) => !existingSectionIds.has(section.id),
    );

    if (additionalSections.length === 0) {
      return;
    }

    const firstAdditionalSectionIndex = journey.sections.length;
    this.journeyState.set({
      ...journey,
      sections: [...journey.sections, ...additionalSections],
    });
    this.activeSectionIndexState.set(firstAdditionalSectionIndex);
  }
}
