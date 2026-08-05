import { httpResource } from '@angular/common/http';
import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, take } from 'rxjs';

import { InsuranceApiService } from '../../../core/api/insurance-api.service';
import {
  ApplicationDefinition,
  ApplicationPage,
  Quote,
  QuoteAnswers,
} from '../../../core/api/insurance-api.models';
import {
  JourneyDefinition,
  JourneyLoadStatus,
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
  private readonly applicationResource = httpResource<ApplicationDefinition>(
    () => '/api/application',
  );

  private readonly journeyState = signal<JourneyDefinition | null>(null);
  private readonly activeSectionIndexState = signal(0);
  private readonly submissionStatusState = signal<QuoteSubmissionStatus>('idle');
  private readonly submissionErrorState = signal<string | null>(null);
  private readonly quoteState = signal<Quote | null>(null);
  private submitSubscription?: Subscription;

  readonly journey = this.journeyState.asReadonly();
  readonly sections = computed(() => this.journeyState()?.sections ?? []);
  readonly activeSectionIndex = this.activeSectionIndexState.asReadonly();
  readonly loadStatus = computed<JourneyLoadStatus>(() => {
    if (this.applicationResource.isLoading()) {
      return 'loading';
    }

    if (this.applicationResource.error()) {
      return 'error';
    }

    return this.applicationResource.hasValue() ? 'loaded' : 'idle';
  });
  readonly errorMessage = computed(() =>
    this.applicationResource.error()
      ? 'We could not load the application. Please try again.'
      : null,
  );
  readonly submissionStatus = this.submissionStatusState.asReadonly();
  readonly submissionError = this.submissionErrorState.asReadonly();
  readonly quote = this.quoteState.asReadonly();

  readonly activeSection = computed(() => this.sections()[this.activeSectionIndexState()] ?? null);

  constructor() {
    effect(() => {
      if (!this.applicationResource.hasValue()) {
        if (this.applicationResource.error()) {
          this.journeyState.set(null);
          this.activeSectionIndexState.set(0);
        }

        return;
      }

      this.journeyState.set(adaptApplicationToJourney(this.applicationResource.value()));
      this.activeSectionIndexState.set(0);
    });
  }

  loadApplication(): void {
    this.submitSubscription?.unsubscribe();
    this.submissionStatusState.set('idle');
    this.submissionErrorState.set(null);
    this.quoteState.set(null);

    if (this.applicationResource.error()) {
      this.applicationResource.reload();
    }
  }

  goToSection(index: number): boolean {
    if (!Number.isInteger(index) || index < 0 || index >= this.sections().length) {
      return false;
    }

    this.activeSectionIndexState.set(index);
    return true;
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
