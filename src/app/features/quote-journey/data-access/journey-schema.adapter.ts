import { ApplicationDefinition, ApplicationPage } from '../../../core/api/insurance-api.models';
import { JourneyDefinition, JourneySection } from '../models/journey.models';

export function adaptApplicationToJourney(application: ApplicationDefinition): JourneyDefinition {
  return {
    applicationId: application.id,
    title: application.title,
    sections: application.pages
      .filter((page) => page.questions.length > 0)
      .map((page) => ({
        id: page.id,
        title: page.title,
        questions: page.questions,
      })),
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
      questions: page.questions,
    }));
}
