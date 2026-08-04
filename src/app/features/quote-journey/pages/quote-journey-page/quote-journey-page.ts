import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';

import { DynamicQuestion } from '../../components/dynamic-question/dynamic-question';
import { JourneySidebar } from '../../components/journey-sidebar/journey-sidebar';
import { QuoteJourneyStore } from '../../data-access/quote-journey.store';
import {
  JourneyForm,
  JourneyFormControl,
  JourneyFormFactory,
} from '../../forms/journey-form.factory';
import { JourneySection, JourneyStage } from '../../models/journey.models';

@Component({
  selector: 'app-quote-journey-page',
  imports: [DynamicQuestion, JourneySidebar, ReactiveFormsModule],
  templateUrl: './quote-journey-page.html',
  styleUrl: './quote-journey-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuoteJourneyPage implements OnInit {
  protected readonly store = inject(QuoteJourneyStore);
  private readonly formFactory = inject(JourneyFormFactory);
  private readonly document = inject(DOCUMENT);

  private readonly formState = signal<JourneyForm | null>(null);
  private readonly completedSectionIdsState = signal<ReadonlySet<string>>(new Set());
  private readonly highestReachableIndexState = signal(0);
  private readonly reviewReadyState = signal(false);
  private loadedApplicationId: string | null = null;

  protected readonly form = this.formState.asReadonly();
  protected readonly completedSectionIds = this.completedSectionIdsState.asReadonly();
  protected readonly highestReachableIndex = this.highestReachableIndexState.asReadonly();
  protected readonly reviewReady = this.reviewReadyState.asReadonly();
  protected readonly activeStage = computed<JourneyStage>(() =>
    this.reviewReadyState() ? 'quote' : this.store.activeStage(),
  );
  protected readonly allQuestions = computed(() =>
    this.store.sections().flatMap((section) => section.questions),
  );

  constructor() {
    effect(() => {
      const journey = this.store.journey();

      if (journey && journey.applicationId !== this.loadedApplicationId) {
        this.loadedApplicationId = journey.applicationId;
        this.formState.set(this.formFactory.create(journey.sections));
        this.completedSectionIdsState.set(new Set());
        this.highestReachableIndexState.set(0);
        this.reviewReadyState.set(false);
      }
    });
  }

  ngOnInit(): void {
    this.store.loadApplication();
  }

  protected retry(): void {
    this.loadedApplicationId = null;
    this.formState.set(null);
    this.store.loadApplication();
  }

  protected controlFor(questionId: string): JourneyFormControl {
    const control = this.formState()?.controls[questionId];

    if (!control) {
      throw new Error(`No form control exists for question "${questionId}".`);
    }

    return control;
  }

  protected continue(): void {
    const section = this.store.activeSection();

    if (!section || !this.validateSection(section)) {
      this.focusFirstInvalidControl();
      return;
    }

    this.markSectionComplete(section.id);

    if (this.store.goToNextSection()) {
      this.highestReachableIndexState.update((index) =>
        Math.max(index, this.store.activeSectionIndex()),
      );
      this.focusSectionHeading();
      return;
    }

    this.reviewReadyState.set(true);
    this.focusSectionHeading();
  }

  protected goBack(): void {
    if (this.reviewReadyState()) {
      this.reviewReadyState.set(false);
    } else {
      this.store.goToPreviousSection();
    }

    this.focusSectionHeading();
  }

  protected selectSection(index: number): void {
    if (index > this.highestReachableIndexState()) {
      return;
    }

    this.reviewReadyState.set(false);
    this.store.goToSection(index);
    this.focusSectionHeading();
  }

  protected answerFor(questionId: string): string | number {
    return this.controlFor(questionId).value ?? '';
  }

  private validateSection(section: JourneySection): boolean {
    const controls = section.questions.map((question) => this.controlFor(question.id));

    for (const control of controls) {
      control.markAsTouched();
      control.updateValueAndValidity();
    }

    return controls.every((control) => control.valid);
  }

  private markSectionComplete(sectionId: string): void {
    this.completedSectionIdsState.update((completedIds) => {
      const updatedIds = new Set(completedIds);
      updatedIds.add(sectionId);
      return updatedIds;
    });
  }

  private focusFirstInvalidControl(): void {
    queueMicrotask(() => {
      const invalidControl = this.document.querySelector<HTMLElement>(
        '.journey-content input.ng-invalid, .journey-content select.ng-invalid',
      );
      invalidControl?.focus();
    });
  }

  private focusSectionHeading(): void {
    queueMicrotask(() => {
      this.document.getElementById('section-title')?.focus();
    });
  }
}
