import { createHash } from 'node:crypto';
import {
  validateFormAnswers,
  validateFormDefinition,
  type FormAnswersValidationIssue,
} from '@form-farm/form-domain';

import { ApplicationError } from '../errors/application-error.js';
import type { FormSubmissionTransaction } from '../ports/form-submission-transaction.js';
import type { StoredSubmissionFormVersion } from '../ports/form-submission-transaction.js';

export interface SubmitFormRequest {
  readonly formId: string;
  readonly formVersion: number;
  readonly answers: unknown;
  readonly idempotencyKey: string;
}

export interface SubmitFormResult {
  readonly submissionId: string;
  readonly replayed: boolean;
}

export class SubmitForm {
  constructor(private readonly transaction: FormSubmissionTransaction) {}

  async execute(request: SubmitFormRequest): Promise<SubmitFormResult> {
    if (!UUID_PATTERN.test(request.idempotencyKey)) {
      throw new ApplicationError('invalid_input', 'The request is invalid.');
    }

    const fingerprint = fingerprintRequest(request.formId, request.formVersion, request.answers);
    const result = await this.transaction.execute(
      {
        formId: request.formId,
        formVersion: request.formVersion,
        idempotencyKey: request.idempotencyKey,
        requestFingerprint: fingerprint,
      },
      (stored) => validateStoredAnswers(stored, request.answers),
    );

    if (result.status === 'not_found') throw new ApplicationError('not_found', 'Form not found.');
    if (result.status === 'not_accepting') {
      throw new ApplicationError('conflict', 'The form is not accepting submissions.');
    }
    if (result.status === 'idempotency_conflict') {
      throw new ApplicationError('conflict', 'The idempotency key has already been used.');
    }
    return { submissionId: result.submissionId, replayed: result.status === 'replayed' };
  }
}

export class InvalidFormSubmissionError extends Error {
  override readonly name = 'InvalidFormSubmissionError';
  constructor(readonly issues: readonly FormAnswersValidationIssue[]) {
    super('The submitted answers are invalid.');
  }
}

function validateStoredAnswers(stored: StoredSubmissionFormVersion, answers: unknown) {
  const definitionResult = validateFormDefinition(stored.definition);
  if (
    !definitionResult.success ||
    definitionResult.value.id !== stored.rowFormId ||
    definitionResult.value.formVersion !== stored.rowVersion ||
    definitionResult.value.schemaVersion !== stored.rowSchemaVersion
  ) {
    throw new Error('Stored submission form definition is invalid.');
  }
  const answerResult = validateFormAnswers(definitionResult.value, answers);
  if (!answerResult.success) throw new InvalidFormSubmissionError(answerResult.issues);
  return answerResult.value;
}

export function fingerprintRequest(formId: string, formVersion: number, answers: unknown): string {
  return createHash('sha256')
    .update(canonicalize({ formId, formVersion, answers }), 'utf8')
    .digest('hex');
}

function canonicalize(value: unknown): string {
  if (typeof value === 'string') {
    if (hasLoneSurrogate(value)) {
      throw new ApplicationError('invalid_input', 'The request is invalid.');
    }
    return JSON.stringify(value);
  }
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new ApplicationError('invalid_input', 'The request is invalid.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    if (Object.keys(object).some(hasLoneSurrogate)) {
      throw new ApplicationError('invalid_input', 'The request is invalid.');
    }
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
      .join(',')}}`;
  }
  throw new ApplicationError('invalid_input', 'The request is invalid.');
}

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return true;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return true;
  }
  return false;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
