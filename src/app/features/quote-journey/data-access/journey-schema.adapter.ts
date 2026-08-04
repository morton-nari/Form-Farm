import { ApplicationDefinition, ApplicationPage } from '../../../core/api/insurance-api.models';
import { JourneyDefinition, JourneySection } from '../models/journey.models';

const YOUR_DETAILS_QUESTION_IDS = new Set(['email', 'phone']);

export function adaptApplicationToJourney(application: ApplicationDefinition): JourneyDefinition {
  const yourDetailsQuestions = application.pages.flatMap((page) =>
    page.questions.filter((question) => YOUR_DETAILS_QUESTION_IDS.has(question.id)),
  );

  const applicationSections: JourneySection[] = application.pages
    .map((page) => ({
      id: page.id,
      title: page.title,
      stage: 'application' as const,
      questions: page.questions.filter((question) => !YOUR_DETAILS_QUESTION_IDS.has(question.id)),
    }))
    .filter((section) => section.questions.length > 0);

  return {
    applicationId: application.id,
    title: application.title,
    sections: [
      {
        id: 'your-details',
        title: 'Your Details',
        stage: 'your-details',
        questions: yourDetailsQuestions,
      },
      ...applicationSections,
    ],
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
      stage: 'application' as const,
      questions: page.questions,
    }));
}
