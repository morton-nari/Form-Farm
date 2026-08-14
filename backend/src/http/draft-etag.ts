import { ApplicationError } from '../application/errors/application-error.js';

const MAXIMUM_DRAFT_REVISION = Number.MAX_SAFE_INTEGER;
const DRAFT_ETAG = /^"draft-([1-9][0-9]*)"$/;

export function parseDraftIfMatch(value: string | string[] | undefined): number {
  if (typeof value !== 'string') throw invalidEtag();
  const match = DRAFT_ETAG.exec(value);
  if (!match) throw invalidEtag();
  const revision = Number(match[1]);
  if (!Number.isSafeInteger(revision) || revision > MAXIMUM_DRAFT_REVISION) throw invalidEtag();
  return revision;
}

export function draftEtag(revision: number): string {
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Invalid draft revision.');
  return `"draft-${revision}"`;
}

function invalidEtag(): ApplicationError {
  return new ApplicationError('invalid_input', 'A valid draft If-Match header is required.');
}
