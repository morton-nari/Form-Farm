import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, OnInit, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';

import { FormAnswerValue } from '@form-farm/form-domain';
import { DynamicField } from '../../../../shared/form-runner/components/dynamic-field/dynamic-field';
import {
  DynamicForm,
  DynamicFormControl,
  DynamicFormFactory,
} from '../../../../shared/form-runner/forms/dynamic-form.factory';
import { FormViewerStore } from '../../data-access/form-viewer.store';

const DEFAULT_FORM_ID = 'customer-feedback';

@Component({
  selector: 'app-form-viewer-page',
  imports: [DynamicField, ReactiveFormsModule],
  templateUrl: './form-viewer-page.html',
  styleUrl: './form-viewer-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormViewerPage implements OnInit {
  protected readonly store = inject(FormViewerStore);
  private readonly formFactory = inject(DynamicFormFactory);
  private readonly document = inject(DOCUMENT);
  private readonly formState = signal<DynamicForm | null>(null);
  private loadedDefinitionKey: string | null = null;

  protected readonly form = this.formState.asReadonly();
  protected readonly reviewing = signal(false);

  constructor() {
    effect(() => {
      const definition = this.store.definition();
      const definitionKey = definition ? `${definition.id}:${definition.formVersion}` : null;
      if (definition && definitionKey !== this.loadedDefinitionKey) {
        this.loadedDefinitionKey = definitionKey;
        this.formState.set(this.formFactory.create(definition.sections));
        this.reviewing.set(false);
      }
    });
  }

  ngOnInit(): void {
    this.store.load(DEFAULT_FORM_ID);
  }

  protected retry(): void {
    this.loadedDefinitionKey = null;
    this.formState.set(null);
    this.store.load(DEFAULT_FORM_ID);
  }

  protected controlFor(fieldId: string): DynamicFormControl {
    const control = this.formState()?.controls[fieldId];
    if (!control) throw new Error(`No form control exists for field "${fieldId}".`);
    return control;
  }

  protected review(): void {
    const form = this.formState();
    if (!form) return;

    form.markAllAsTouched();
    form.updateValueAndValidity();
    if (form.invalid) {
      queueMicrotask(() =>
        this.document
          .querySelector<HTMLElement>(
            '.form-content input.ng-invalid, .form-content select.ng-invalid, .form-content textarea.ng-invalid',
          )
          ?.focus(),
      );
      return;
    }

    this.reviewing.set(true);
    this.focusHeading();
  }

  protected edit(): void {
    this.reviewing.set(false);
    this.focusHeading();
  }

  protected answerFor(fieldId: string): FormAnswerValue | '' {
    return this.controlFor(fieldId).value ?? '';
  }

  protected displayAnswer(fieldId: string): string {
    const value = this.answerFor(fieldId);
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value) || 'Not answered';
  }

  private focusHeading(): void {
    queueMicrotask(() => this.document.getElementById('form-title')?.focus());
  }
}
