import { describe, expect, it } from 'vitest';

import { draftEtag, parseDraftIfMatch } from './draft-etag.js';

describe('draft ETags', () => {
  it.each(['"draft-1"', '"draft-7"', '"draft-9007199254740991"'])('parses %s', (value) => {
    expect(parseDraftIfMatch(value)).toBe(Number(value.slice(7, -1)));
  });

  it.each([
    undefined,
    ['"draft-1"'],
    'W/"draft-1"',
    '*',
    '"draft-1", "draft-2"',
    'draft-1',
    ' "draft-1"',
    '"draft-01"',
    '"draft-0"',
    '"draft--1"',
    '"draft-9007199254740992"',
  ])('rejects malformed value %j', (value) => {
    expect(() => parseDraftIfMatch(value)).toThrowError(
      expect.objectContaining({ code: 'invalid_input' }),
    );
  });

  it('formats strong ETags', () => expect(draftEtag(8)).toBe('"draft-8"'));
});
