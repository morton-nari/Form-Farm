import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import type { FormDefinition } from '@form-farm/form-domain';

import { DynamicField } from '../../shared/form-runner/components/dynamic-field/dynamic-field';
import {
  DynamicForm,
  DynamicFormControl,
  DynamicFormFactory,
} from '../../shared/form-runner/forms/dynamic-form.factory';

@Component({
  selector: 'app-form-draft-preview',
  imports: [DynamicField, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card card-body mt-4" aria-labelledby="draft-preview-title">
      <p class="text-uppercase text-primary fw-semibold mb-1">Draft preview</p>
      <h2 id="draft-preview-title" class="h3">{{ definition().title }}</h2>
      @if (definition().description) {
        <p class="text-body-secondary">{{ definition().description }}</p>
      }
      @if (form(); as previewForm) {
        <form [formGroup]="previewForm" novalidate (ngSubmit)="checkValidation()">
          @for (section of definition().sections; track section.id) {
            <fieldset class="border-0 p-0 mb-4">
              <legend class="h4">{{ section.title }}</legend>
              @if (section.description) {
                <p class="text-body-secondary">{{ section.description }}</p>
              }
              @for (field of section.fields; track field.id) {
                <app-dynamic-field [field]="field" [control]="controlFor(field.id)" />
              }
            </fieldset>
          }
          <button class="btn btn-primary" type="submit">Check preview validation</button>
        </form>
      }
      <p class="text-body-secondary mt-3 mb-0">
        Preview answers stay in this browser and cannot be submitted.
      </p>
    </section>
  `,
})
export class FormDraftPreview {
  readonly definition = input.required<FormDefinition>();
  private readonly factory = inject(DynamicFormFactory);
  protected readonly form = signal<DynamicForm | null>(null);

  constructor() {
    effect(() => this.form.set(this.factory.create(this.definition().sections)));
  }

  protected controlFor(fieldId: string): DynamicFormControl {
    const control = this.form()?.controls[fieldId];
    if (!control) throw new Error(`No preview control exists for field "${fieldId}".`);
    return control;
  }

  protected checkValidation(): void {
    this.form()?.markAllAsTouched();
    this.form()?.updateValueAndValidity();
  }
}
