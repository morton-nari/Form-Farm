import { ApplicationQuestion } from '../../../core/api/insurance-api.models';

export type JourneyStage = 'application' | 'quote';

export interface JourneyDefinition {
  readonly applicationId: string;
  readonly title: string;
  readonly sections: readonly JourneySection[];
}

export interface JourneySection {
  readonly id: string;
  readonly title: string;
  readonly questions: readonly ApplicationQuestion[];
}



export type JourneyLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

export type QuoteSubmissionStatus =
  'idle' | 'submitting' | 'additional-questions' | 'quoted' | 'error';
