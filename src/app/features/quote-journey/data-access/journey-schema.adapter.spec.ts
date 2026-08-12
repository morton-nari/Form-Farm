import { ApplicationDefinition } from '../../../core/api/insurance-api.models';
import { validateFormDefinition } from '../../../domain/forms/form-definition.validator';
import {
  adaptAdditionalPagesToSections,
  adaptApplicationToJourney,
} from './journey-schema.adapter';

describe('adaptApplicationToJourney', () => {
  it('preserves the API pages and their question groupings', () => {
    const application = createApplicationDefinition();

    const journey = adaptApplicationToJourney(application);

    expect(validateFormDefinition(journey)).toEqual({ success: true, value: journey });
    expect(journey.id).toBe('legacy-1');
    expect(journey.schemaVersion).toBe(1);
    expect(journey.formVersion).toBe(1);
    expect(journey.title).toBe('Life Insurance Application');
    expect(journey.sections.map((section) => section.id)).toEqual(['about-you', 'lifestyle']);
    expect(journey.sections[0]?.fields.map((field) => field.id)).toEqual([
      'email',
      'phone',
      'occupation',
    ]);
    expect(journey.sections[1]?.fields.map((field) => field.id)).toEqual(['smokedLast12Months']);
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
      fields: [
        {
          id: 'futureQuestion',
          label: 'Future question',
          type: 'text',
          validation: undefined,
        },
      ],
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
      fields: [
        expect.objectContaining({
          id: 'cigarettesPerWeek',
          type: 'number',
          validation: [{ type: 'required' }, { type: 'min', value: 0 }, { type: 'integer' }],
        }),
      ],
    });
  });

  it('separates legacy option labels and values and maps phone semantics explicitly', () => {
    const journey = adaptApplicationToJourney(createApplicationDefinition());
    const fields = journey.sections.flatMap((section) => section.fields);

    expect(fields.find((field) => field.id === 'phone')).toMatchObject({
      type: 'tel',
      autocomplete: 'tel',
    });
    expect(fields.find((field) => field.id === 'occupation')).toMatchObject({
      type: 'select',
      options: [
        { label: 'Accountant', value: 'Accountant' },
        { label: 'Teacher', value: 'Teacher' },
        { label: 'Builder', value: 'Builder' },
        { label: 'Pilot', value: 'Pilot' },
        { label: 'Other', value: 'Other' },
      ],
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
