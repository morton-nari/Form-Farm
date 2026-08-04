import { Injectable } from '@angular/core';
import { FormControl, FormRecord, ValidatorFn, Validators } from '@angular/forms';

import {
  AnswerValue,
  ApplicationQuestion,
  QuoteAnswers,
} from '../../../core/api/insurance-api.models';
import { JourneySection } from '../models/journey.models';

export type JourneyFormControl = FormControl<AnswerValue | null>;
export type JourneyForm = FormRecord<JourneyFormControl>;

@Injectable({ providedIn: 'root' })
export class JourneyFormFactory {
  create(sections: readonly JourneySection[]): JourneyForm {
    const form = new FormRecord<JourneyFormControl>({});

    this.addQuestions(
      form,
      sections.flatMap((section) => section.questions),
    );

    return form;
  }

  addQuestions(form: JourneyForm, questions: readonly ApplicationQuestion[]): void {
    for (const question of questions) {
      if (form.contains(question.id)) {
        continue;
      }

      form.addControl(
        question.id,
        new FormControl<AnswerValue | null>(null, this.validatorsFor(question)),
      );
    }
  }

  getAnswers(form: JourneyForm): QuoteAnswers {
    const answers: Record<string, AnswerValue> = {};

    for (const [questionId, value] of Object.entries(form.getRawValue())) {
      if (value !== null && value !== '') {
        answers[questionId] = value;
      }
    }

    return answers;
  }

  private validatorsFor(question: ApplicationQuestion): ValidatorFn[] {
    const validators: ValidatorFn[] = [];

    if (question.required) {
      validators.push(Validators.required);
    }

    if (question.type === 'email') {
      validators.push(Validators.email);
    }

    if (question.type === 'number') {
      validators.push(Validators.min(0));
    }

    return validators;
  }
}
