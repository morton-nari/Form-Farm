import { Injectable } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormRecord,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';

import { FormAnswers, FormAnswerValue, FormField, FormSection } from '@form-farm/form-domain';

export type DynamicFormControl = FormControl<FormAnswerValue | null>;
export type DynamicForm = FormRecord<DynamicFormControl>;

@Injectable({ providedIn: 'root' })
export class DynamicFormFactory {
  create(sections: readonly FormSection[]): DynamicForm {
    const form = new FormRecord<DynamicFormControl>({});
    this.addFields(
      form,
      sections.flatMap((section) => section.fields),
    );
    return form;
  }

  addFields(form: DynamicForm, fields: readonly FormField[]): void {
    for (const field of fields) {
      if (form.contains(field.id)) continue;
      form.addControl(
        field.id,
        new FormControl<FormAnswerValue | null>(
          'defaultValue' in field ? (field.defaultValue ?? null) : null,
          this.validatorsFor(field),
        ),
      );
    }
  }

  getAnswers(form: DynamicForm): FormAnswers {
    const answers: Record<string, FormAnswerValue> = {};
    for (const [fieldId, value] of Object.entries(form.getRawValue())) {
      if (value !== null && value !== '') answers[fieldId] = value;
    }
    return answers;
  }

  private validatorsFor(field: FormField): ValidatorFn[] {
    const validators: ValidatorFn[] = [];
    for (const rule of field.validation ?? []) {
      switch (rule.type) {
        case 'required':
          validators.push(Validators.required);
          break;
        case 'accepted':
          validators.push(Validators.requiredTrue);
          break;
        case 'minLength':
          validators.push(Validators.minLength(rule.value));
          break;
        case 'maxLength':
          validators.push(Validators.maxLength(rule.value));
          break;
        case 'min':
          validators.push(Validators.min(rule.value));
          break;
        case 'max':
          validators.push(Validators.max(rule.value));
          break;
        case 'integer':
          validators.push(integerValidator);
          break;
        case 'minSelections':
          validators.push(
            selectionCountValidator('minSelections', rule.value, (count) => count >= rule.value),
          );
          break;
        case 'maxSelections':
          validators.push(
            selectionCountValidator('maxSelections', rule.value, (count) => count <= rule.value),
          );
          break;
        case 'earliest':
          validators.push(
            temporalRangeValidator('earliest', rule.value, (value) => value >= rule.value),
          );
          break;
        case 'latest':
          validators.push(
            temporalRangeValidator('latest', rule.value, (value) => value <= rule.value),
          );
          break;
      }
    }

    if (field.type === 'email') validators.push(Validators.email);
    if (field.type === 'url') validators.push(urlValidator);
    return validators;
  }
}

const integerValidator: ValidatorFn = (control) =>
  control.value === null || control.value === '' || Number.isInteger(control.value)
    ? null
    : { integer: true };

const urlValidator: ValidatorFn = (control) => {
  if (control.value === null || control.value === '') return null;
  try {
    new URL(String(control.value));
    return null;
  } catch {
    return { url: true };
  }
};

function selectionCountValidator(
  key: string,
  expected: number,
  predicate: (count: number) => boolean,
): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const count = Array.isArray(control.value) ? control.value.length : 0;
    return predicate(count) ? null : { [key]: { expected, actual: count } };
  };
}

function temporalRangeValidator(
  key: string,
  expected: string,
  predicate: (value: string) => boolean,
): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (control.value === null || control.value === '') return null;
    return predicate(String(control.value)) ? null : { [key]: { expected, actual: control.value } };
  };
}
