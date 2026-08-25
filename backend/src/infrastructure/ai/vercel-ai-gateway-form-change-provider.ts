import { generateText, Output } from 'ai';

import type {
  FormChangeProposalGeneration,
  FormChangeProposalProvider,
  FormChangeProposalRequest,
} from '../../application/ports/form-change-proposal-provider.js';

export const MAXIMUM_AI_PROPOSAL_OUTPUT_TOKENS = 4_000;

interface GenerateJsonOptions {
  readonly model: string;
  readonly system: string;
  readonly prompt: string;
  readonly abortSignal: AbortSignal;
}

interface GenerateJsonResult {
  readonly output: unknown;
  readonly finishReason: string;
  readonly inputTokens: number | undefined;
  readonly outputTokens: number | undefined;
}

type GenerateStructuredJson = (options: GenerateJsonOptions) => Promise<GenerateJsonResult>;

export class VercelAiGatewayFormChangeProvider implements FormChangeProposalProvider {
  constructor(
    private readonly model: string,
    private readonly generateStructuredJson: GenerateStructuredJson = generateJson,
  ) {}

  async generateProposal(
    request: FormChangeProposalRequest,
  ): Promise<FormChangeProposalGeneration> {
    const result = await this.generateStructuredJson({
      model: this.model,
      system: systemInstruction,
      prompt: JSON.stringify({ goal: request.goal, draft: request.draft }),
      abortSignal: request.abortSignal,
    });
    return {
      output: result.output,
      metadata: {
        provider: 'vercel-ai-gateway',
        model: this.model,
        finishReason: result.finishReason,
        inputTokens: result.inputTokens ?? null,
        outputTokens: result.outputTokens ?? null,
      },
    };
  }

  generate(request: FormChangeProposalRequest): Promise<FormChangeProposalGeneration> {
    return this.generateProposal(request);
  }
}

async function generateJson(options: GenerateJsonOptions): Promise<GenerateJsonResult> {
  const result = await generateText({
    ...options,
    output: Output.json({
      name: 'FormChangeSet',
      description: 'A versioned set of controlled Form Farm draft operations.',
    }),
    maxOutputTokens: MAXIMUM_AI_PROPOSAL_OUTPUT_TOKENS,
  });
  return {
    output: result.output,
    finishReason: result.finishReason,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  };
}

const systemInstruction = `You propose changes to one Form Farm draft.
Return only a FormChangeSet with changeSetVersion 1 and an ordered operations array.
Use only stable section and field identifiers present in the supplied draft unless an add operation creates a new identifier.
Never return a complete replacement FormDefinition, source code, SQL, prose, credentials, or submission data.
The proposal is untrusted, will be validated, and will not be saved or published automatically.`;
