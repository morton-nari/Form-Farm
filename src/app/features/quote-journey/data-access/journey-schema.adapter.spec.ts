import { ApplicationDefinition } from '../../../core/api/insurance-api.models';
import {
  adaptAdditionalPagesToSections,
  adaptApplicationToJourney,
} from './journey-schema.adapter';

describe('adaptApplicationToJourney', () => {
  it('separates contact questions from the API About You page', () => {
    const application = createApplicationDefinition();

    const journey = adaptApplicationToJourney(application);

    expect(journey.applicationId).toBe('1');
    expect(journey.title).toBe('Life Insurance Application');
    expect(journey.sections.map((section) => section.id)).toEqual([
      'your-details',
      'about-you',
      'lifestyle',
    ]);
    expect(journey.sections[0]?.questions.map((question) => question.id)).toEqual([
      'email',
      'phone',
    ]);
    expect(journey.sections[1]?.questions.map((question) => question.id)).toEqual(['occupation']);
    expect(journey.sections[2]?.questions.map((question) => question.id)).toEqual([
      'smokedLast12Months',
    ]);
  });

  it('preserves API-driven pages that do not contain contact questions', () => {
    const application: ApplicationDefinition = {
      ...createApplicationDefinition(),
      pages: [
        ...createApplicationDefinition().pages,
        {
          id: 'future-page',
          title: 'Future Page',
          questions: [
            {
              id: 'futureQuestion',
              label: 'Future question',
              type: 'text',
              required: false,
            },
          ],
        },
      ],
    };

    const journey = adaptApplicationToJourney(application);

    expect(journey.sections.at(-1)).toEqual({
      id: 'future-page',
      title: 'Future Page',
      stage: 'application',
      questions: application.pages.at(-1)?.questions,
    });
  });

  it('adapts non-empty follow-up pages into application sections', () => {
    const sections = adaptAdditionalPagesToSections([
      {
        id: 'smoking-details',
        title: 'Smoking Details',
        questions: [
          {
            id: 'cigarettesPerWeek',
            label: 'How many cigarettes do you smoke each week?',
            type: 'number',
            required: true,
          },
        ],
      },
      { id: 'empty-page', title: 'Empty Page', questions: [] },
    ]);

    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({
      id: 'smoking-details',
      title: 'Smoking Details',
      stage: 'application',
    });
  });
});

function createApplicationDefinition(): ApplicationDefinition {
  return {
    id: '1',
    title: 'Life Insurance Application',
    pages: [
      {
        id: 'about-you',
        title: 'About You',
        questions: [
          {
            id: 'email',
            label: 'Email Address',
            type: 'email',
            required: true,
          },
          {
            id: 'phone',
            label: 'Phone Number',
            type: 'text',
            required: true,
          },
          {
            id: 'occupation',
            label: 'Occupation',
            type: 'select',
            required: true,
            options: ['Accountant', 'Teacher', 'Builder', 'Pilot', 'Other'],
          },
        ],
      },
      {
        id: 'lifestyle',
        title: 'Lifestyle',
        questions: [
          {
            id: 'smokedLast12Months',
            label: 'Have you smoked in the last 12 months?',
            type: 'radio',
            required: true,
            options: ['Yes', 'No'],
          },
        ],
      },
    ],
  };
}
