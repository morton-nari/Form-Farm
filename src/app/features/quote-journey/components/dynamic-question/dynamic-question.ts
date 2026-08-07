import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';

import { ApplicationQuestion } from '../../../../core/api/insurance-api.models';
import { JourneyFormControl } from '../../forms/journey-form.factory';

@Component({
  selector: 'app-dynamic-question',
  imports: [ReactiveFormsModule],
  templateUrl: './dynamic-question.html',
  styleUrl: './dynamic-question.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DynamicQuestion {
  readonly question = input.required<ApplicationQuestion>();
  readonly control = input.required<JourneyFormControl>();

  protected readonly controlId = computed(() => `question-${this.question().id}`);
  protected readonly errorId = computed(() => `${this.controlId()}-error`);

  protected showError(): boolean {
    return this.control().touched && this.control().invalid;
  }
}
