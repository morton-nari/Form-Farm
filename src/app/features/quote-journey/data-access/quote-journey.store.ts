import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, take } from 'rxjs';

import { InsuranceApiService } from '../../../core/api/insurance-api.service';
import { JourneyDefinition, JourneyLoadStatus, JourneyStage } from '../models/journey.models';
import { adaptApplicationToJourney } from './journey-schema.adapter';

@Injectable({ providedIn: 'root' })
export class QuoteJourneyStore {
  private readonly api = inject(InsuranceApiService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly journeyState = signal<JourneyDefinition | null>(null);
  private readonly activeSectionIndexState = signal(0);
  private readonly loadStatusState = signal<JourneyLoadStatus>('idle');
  private readonly errorMessageState = signal<string | null>(null);
  private loadSubscription?: Subscription;

  readonly journey = this.journeyState.asReadonly();
  readonly sections = computed(() => this.journeyState()?.sections ?? []);
  readonly activeSectionIndex = this.activeSectionIndexState.asReadonly();
  readonly loadStatus = this.loadStatusState.asReadonly();
  readonly errorMessage = this.errorMessageState.asReadonly();

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
    this.loadStatusState.set('loading');
    this.errorMessageState.set(null);

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
}
