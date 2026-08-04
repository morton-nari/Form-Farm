import { ApplicationQuestion } from '../../../core/api/insurance-api.models';

export type JourneyStage = 'your-details' | 'application' | 'quote';

export interface JourneySection {
  readonly id: string;
  readonly title: string;
  readonly stage: Exclude<JourneyStage, 'quote'>;
  readonly questions: readonly ApplicationQuestion[];
}

export interface JourneyDefinition {
  readonly applicationId: string;
  readonly title: string;
  readonly sections: readonly JourneySection[];
}

export type JourneyLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';
