import {
  ApplicationDefinition,
  ApplicationPage,
  ApplicationQuestion,
} from '../../../core/api/insurance-api.models';
import { FormField } from '../../../domain/forms/form-definition.models';
import { JourneyDefinition, JourneySection } from '../models/journey.models';

export function adaptApplicationToJourney(application: ApplicationDefinition): JourneyDefinition {
  return {
    schemaVersion: 1,
    id: `legacy-${application.id.replace(/[^A-Za-z0-9_-]/g, '-')}`,
    formVersion: 1,
    title: application.title,
    sections: application.pages
      .filter((page) => page.questions.length > 0)
      .map((page) => ({
        id: page.id,
        title: page.title,
        fields: page.questions.map(adaptQuestionToField),
      })),
    submission: {
      submitLabel: 'Get my quote',
      successMessage: 'Your quote is ready.',
    },
  };
}

export function adaptAdditionalPagesToSections(
  pages: readonly ApplicationPage[],
): readonly JourneySection[] {
  return pages
    .filter((page) => page.questions.length > 0)
    .map((page) => ({
      id: page.id,
      title: page.title,
      fields: page.questions.map(adaptQuestionToField),
    }));
}

function adaptQuestionToField(question: ApplicationQuestion): FormField {
  const required = question.required ? [{ type: 'required' as const }] : undefined;

  switch (question.type) {
    case 'email':
      return { id: question.id, type: 'email', label: question.label, validation: required };
    case 'number':
      return {
        id: question.id,
        type: 'number',
        label: question.label,
        validation: [...(required ?? []), { type: 'min', value: 0 }, { type: 'integer' }],
      };
    case 'select':
    case 'radio':
      return {
        id: question.id,
        type: question.type,
        label: question.label,
        options: (question.options ?? []).map((option) => ({ label: option, value: option })),
        validation: required,
      };
    case 'text':
      if (question.id === 'phone') {
        return {
          id: question.id,
          type: 'tel',
          label: question.label,
          autocomplete: 'tel',
          validation: required,
        };
      }
      return { id: question.id, type: 'text', label: question.label, validation: required };
  }
}
