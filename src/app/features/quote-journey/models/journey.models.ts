import { FormDefinition, FormSection } from '../../../domain/forms/form-definition.models';

export type JourneyStage = 'application' | 'quote';

export type JourneyDefinition = FormDefinition;
export type JourneySection = FormSection;

export type JourneyLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

export type QuoteSubmissionStatus =
  'idle' | 'submitting' | 'additional-questions' | 'quoted' | 'error';
