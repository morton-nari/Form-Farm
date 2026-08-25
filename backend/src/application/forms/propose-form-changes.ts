import {
  analyzeFormChangeImpact,
  analyzeFormDefinition,
  applyFormChangeSet,
  compareFormDefinitions,
  validateFormChangeSet,
  validateFormDraftDefinition,
  type FormAnalysisReport,
  type FormChangeImpact,
  type FormChangeSet,
  type FormSemanticDiff,
} from '@form-farm/form-domain';

import { ApplicationError } from '../errors/application-error.js';
import type { AuthenticatedActor } from '../ports/create-form-draft-transaction.js';
import type { FormChangeProposalProvider } from '../ports/form-change-proposal-provider.js';
import type { FormIntelligenceSource } from '../ports/form-intelligence-source.js';
import { InvalidStoredFormDefinitionError } from './get-form-definition.js';

export const MAXIMUM_FORM_CHANGE_GOAL_LENGTH = 1_000;
export const FORM_CHANGE_PROPOSAL_TIMEOUT_MILLISECONDS = 10_000;
const MAXIMUM_PROPOSAL_CHANGES = 1_000;

export interface FormChangeProposal {
  readonly draftRevision: number;
  readonly changeSet: FormChangeSet;
  readonly diff: FormSemanticDiff;
  readonly impact: FormChangeImpact;
  readonly candidateAnalysis: FormAnalysisReport | null;
  readonly candidatePublishable: boolean;
  readonly generation: {
    readonly provider: string;
    readonly model: string;
    readonly finishReason: string;
    readonly inputTokens: number | null;
    readonly outputTokens: number | null;
  };
}

export class ProposeFormChanges {
  constructor(
    private readonly source: FormIntelligenceSource,
    private readonly provider: FormChangeProposalProvider,
    private readonly timeoutMilliseconds = FORM_CHANGE_PROPOSAL_TIMEOUT_MILLISECONDS,
  ) {}

  async execute(
    actor: AuthenticatedActor,
    formId: string,
    goalInput: unknown,
    abortSignal?: AbortSignal,
  ): Promise<FormChangeProposal> {
    const goal = validateGoal(goalInput);
    const stored = await this.source.findDraftForOwner(actor, formId);
    if (!stored) throw new ApplicationError('not_found', 'Form not found.');
    const validated = validateFormDraftDefinition(stored.definition);
    if (
      !validated.success ||
      validated.value.id !== stored.formId ||
      validated.value.formVersion !== stored.latestVersion + 1
    ) {
      throw new InvalidStoredFormDefinitionError(
        stored.formId,
        validated.success ? 1 : validated.issues.length,
      );
    }

    const timeoutSignal = AbortSignal.timeout(this.timeoutMilliseconds);
    let generation;
    try {
      generation = await this.provider.generate({
        goal,
        draft: validated.value,
        abortSignal: abortSignal ? AbortSignal.any([abortSignal, timeoutSignal]) : timeoutSignal,
      });
    } catch {
      throw new FormChangeProposalGenerationError();
    }
    const changeSet = validateFormChangeSet(generation.output);
    if (!changeSet.success) throw invalidProposal();
    const applied = applyFormChangeSet(validated.value, changeSet.value);
    if (!applied.success) throw invalidProposal();
    const compared = compareFormDefinitions(validated.value, applied.value, {
      maxChanges: MAXIMUM_PROPOSAL_CHANGES,
    });
    if (!compared.success || compared.value.truncated) throw invalidProposal();
    const impact = analyzeFormChangeImpact(compared.value);
    if (!impact.success) throw invalidProposal();
    const analysis = analyzeFormDefinition(applied.value);

    return {
      draftRevision: stored.revision,
      changeSet: changeSet.value,
      diff: compared.value,
      impact: impact.value,
      candidateAnalysis: analysis.success ? analysis.value : null,
      candidatePublishable: analysis.success,
      generation: generation.metadata,
    };
  }
}

export class FormChangeProposalGenerationError extends Error {
  override readonly name = 'FormChangeProposalGenerationError';

  constructor() {
    super('Form-change proposal generation failed.');
  }
}

function validateGoal(input: unknown): string {
  if (typeof input !== 'string') throw invalidGoal();
  const goal = input.trim();
  if (goal.length === 0 || goal.length > MAXIMUM_FORM_CHANGE_GOAL_LENGTH) throw invalidGoal();
  return goal;
}

function invalidGoal(): ApplicationError {
  return new ApplicationError('invalid_input', 'The form-change goal is invalid.');
}

function invalidProposal(): ApplicationError {
  return new ApplicationError('invalid_input', 'The generated form-change proposal is invalid.');
}
