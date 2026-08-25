import type { FormDraftDefinition } from '@form-farm/form-domain';

export interface FormChangeProposalRequest {
  readonly goal: string;
  readonly draft: FormDraftDefinition;
  readonly abortSignal: AbortSignal;
}

export interface FormChangeProposalGeneration {
  readonly output: unknown;
  readonly metadata: {
    readonly provider: string;
    readonly model: string;
    readonly finishReason: string;
    readonly inputTokens: number | null;
    readonly outputTokens: number | null;
  };
}

export interface FormChangeProposalProvider {
  generate(request: FormChangeProposalRequest): Promise<FormChangeProposalGeneration>;
}
