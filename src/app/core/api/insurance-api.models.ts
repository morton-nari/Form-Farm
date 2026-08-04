export type QuestionType = 'email' | 'text' | 'select' | 'radio' | 'number';

export interface ApplicationQuestion {
  readonly id: string;
  readonly label: string;
  readonly type: QuestionType;
  readonly required: boolean;
  readonly options?: readonly string[];
}

export interface ApplicationPage {
  readonly id: string;
  readonly title: string;
  readonly questions: readonly ApplicationQuestion[];
}

export interface ApplicationDefinition {
  readonly id: string;
  readonly title: string;
  readonly pages: readonly ApplicationPage[];
}

export type AnswerValue = string | number;

export type QuoteAnswers = Readonly<Record<string, AnswerValue>>;

export interface QuoteRequest {
  readonly answers: QuoteAnswers;
}

export interface AdditionalQuestionsResponse {
  readonly status: 'additionalQuestionsRequired';
  readonly pages: readonly ApplicationPage[];
}

export interface Quote {
  readonly product: string;
  readonly coverAmount: number;
  readonly premium: number;
}

export interface QuotedResponse {
  readonly status: 'quoted';
  readonly quote: Quote;
}

export type QuoteResponse = AdditionalQuestionsResponse | QuotedResponse;
