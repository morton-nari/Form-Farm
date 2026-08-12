import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';

import { FormField } from '../../../../domain/forms/form-definition.models';
import { DynamicFormControl } from '../../forms/dynamic-form.factory';

@Component({
  selector: 'app-dynamic-field',
  imports: [ReactiveFormsModule],
  templateUrl: './dynamic-field.html',
  styleUrl: './dynamic-field.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DynamicField {
  readonly field = input.required<FormField>();
  readonly control = input.required<DynamicFormControl>();

  protected readonly controlId = computed(() => `field-${this.field().id}`);
  protected readonly errorId = computed(() => `${this.controlId()}-error`);
  protected readonly helpId = computed(() => `${this.controlId()}-help`);
  protected readonly required = computed(() =>
    Boolean(
      this.field().validation?.some((rule) => rule.type === 'required' || rule.type === 'accepted'),
    ),
  );
  protected readonly describedBy = computed(() => {
    const ids: string[] = [];
    if (this.field().helpText) ids.push(this.helpId());
    if (this.showError()) ids.push(this.errorId());
    return ids.length > 0 ? ids.join(' ') : null;
  });

  protected showError(): boolean {
    return this.control().touched && this.control().invalid;
  }

  protected isSelected(value: string): boolean {
    const selected = this.control().value;
    return Array.isArray(selected) && selected.includes(value);
  }

  protected toggleOption(value: string, checked: boolean): void {
    const current = this.control().value;
    const selected = Array.isArray(current) ? [...current] : [];
    const next = checked
      ? [...new Set([...selected, value])]
      : selected.filter((candidate) => candidate !== value);
    this.control().setValue(next);
    this.control().markAsTouched();
  }
}
