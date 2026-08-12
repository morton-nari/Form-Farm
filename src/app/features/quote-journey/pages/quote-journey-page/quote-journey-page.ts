import { CurrencyPipe, DOCUMENT } from '@angular/common';
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

import { DynamicField } from '../../../../shared/form-runner/components/dynamic-field/dynamic-field';
import {
  DynamicForm,
  DynamicFormControl,
  DynamicFormFactory,
} from '../../../../shared/form-runner/forms/dynamic-form.factory';
import { JourneySidebar } from '../../components/journey-sidebar/journey-sidebar';
import { QuoteJourneyStore } from '../../data-access/quote-journey.store';
import { JourneySection, JourneyStage } from '../../models/journey.models';

@Component({
  selector: 'app-quote-journey-page',
  imports: [CurrencyPipe, DynamicField, JourneySidebar, ReactiveFormsModule],
  templateUrl: './quote-journey-page.html',
  styleUrl: './quote-journey-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuoteJourneyPage implements OnInit {
  protected readonly store = inject(QuoteJourneyStore);
  private readonly formFactory = inject(DynamicFormFactory);
  private readonly document = inject(DOCUMENT);

  private readonly formState = signal<DynamicForm | null>(null);
  private readonly completedSectionIdsState = signal<ReadonlySet<string>>(new Set());
  private readonly initialSectionCountState = signal(0);
  private readonly reviewReadyState = signal(false);
  private loadedApplicationId: string | null = null;

  protected readonly form = this.formState.asReadonly();
  protected readonly completedSectionIds = this.completedSectionIdsState.asReadonly();
  protected readonly reviewReady = this.reviewReadyState.asReadonly();
  protected readonly activeStage = computed<JourneyStage>(() => {
    if (this.store.quote() || this.reviewReadyState()) {
      return 'quote';
    }

    return 'application';
  });
  protected readonly formSections = computed(() => {
    const sections = this.store.sections();
    const additionalSections = sections.slice(this.initialSectionCountState());

    return additionalSections.length > 0
      ? additionalSections
      : sections.slice(0, this.initialSectionCountState());
  });
  protected readonly formTitle = computed(
    () => this.formSections()[0]?.title ?? this.store.activeSection()?.title ?? 'Application',
  );
  protected readonly allFields = computed(() =>
    this.store.sections().flatMap((section) => section.fields),
  );

  constructor() {
    effect(() => {
      const journey = this.store.journey();

      if (journey && journey.id !== this.loadedApplicationId) {
        this.loadedApplicationId = journey.id;
        this.formState.set(this.formFactory.create(journey.sections));
        this.completedSectionIdsState.set(new Set());
        this.initialSectionCountState.set(journey.sections.length);
        this.reviewReadyState.set(false);
      } else if (journey && this.formState()) {
        this.formFactory.addFields(
          this.formState()!,
          journey.sections.flatMap((section) => section.fields),
        );
      }
    });

    effect(() => {
      const submissionStatus = this.store.submissionStatus();

      if (submissionStatus === 'additional-questions') {
        this.reviewReadyState.set(false);
        this.focusSectionHeading();
      } else if (submissionStatus === 'quoted') {
        this.reviewReadyState.set(false);
        this.focusSectionHeading();
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

  protected controlFor(fieldId: string): DynamicFormControl {
    const control = this.formState()?.controls[fieldId];

    if (!control) {
      throw new Error(`No form control exists for field "${fieldId}".`);
    }

    return control;
  }

  protected continue(): void {
    const sections = this.formSections();

    if (sections.length === 0 || !this.validateSections(sections)) {
      this.activateSectionForFirstInvalidControl(sections);
      this.focusFirstInvalidControl();
      return;
    }

    for (const section of sections) {
      this.markSectionComplete(section.id);
    }

    this.reviewReadyState.set(true);
    this.focusSectionHeading();
  }

  protected goBack(): void {
    this.reviewReadyState.set(false);

    this.focusSectionHeading();
  }

  protected selectSection(index: number): void {
    this.reviewReadyState.set(false);
    if (this.store.goToSection(index)) {
      this.focusSection(index);
    }
  }

  protected activateSection(index: number): void {
    this.store.goToSection(index);
  }

  protected sectionIndex(sectionId: string): number {
    return this.store.sections().findIndex((section) => section.id === sectionId);
  }

  protected answerFor(fieldId: string): string | number | boolean | readonly string[] {
    return this.controlFor(fieldId).value ?? '';
  }

  protected requestQuote(): void {
    const form = this.formState();

    if (form) {
      this.store.submitQuote(this.formFactory.getAnswers(form));
    }
  }

  private validateSections(sections: readonly JourneySection[]): boolean {
    const controls = sections.flatMap((section) =>
      section.fields.map((field) => this.controlFor(field.id)),
    );

    for (const control of controls) {
      control.markAsTouched();
      control.updateValueAndValidity();
    }

    return controls.every((control) => control.valid);
  }

  private activateSectionForFirstInvalidControl(sections: readonly JourneySection[]): void {
    const invalidSection = sections.find((section) =>
      section.fields.some((field) => this.controlFor(field.id).invalid),
    );

    if (invalidSection) {
      this.store.goToSection(this.sectionIndex(invalidSection.id));
    }
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

  private focusSection(index: number): void {
    queueMicrotask(() => {
      this.document
        .querySelector<HTMLElement>(
          `[data-section-index="${index}"] input, [data-section-index="${index}"] select`,
        )
        ?.focus();
    });
  }
}
