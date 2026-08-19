// apps/api/test/unit/delete-account-contract.test.ts
//
// DeleteAccountRequest (US-A5 / SCR-MOD-08). Pure schema, no database - which
// matters, because the whitespace behaviour below was previously asserted only
// in the integration suite, and that suite runs in CI alone.
//
// SCR-MOD-08 makes the user type their own email address to confirm an
// irreversible action. Everything here is about that string arriving in the
// shapes a human actually produces.

import { describe, expect, it } from 'vitest';
import { DeleteAccountRequest } from '@widgetry/shared';

const parse = (confirmEmail: unknown) => DeleteAccountRequest.safeParse({ confirmEmail });

describe('DeleteAccountRequest.confirmEmail', () => {
  it('accepts a plain address', () => {
    const result = parse('someone@widgetry.test');
    expect(result.success).toBe(true);
    expect(result.data?.confirmEmail).toBe('someone@widgetry.test');
  });

  it('accepts a pasted address with surrounding whitespace', () => {
    // The regression: `.trim()` has to run BEFORE the format check, because
    // z.email() rejects a padded value outright. A trailing space is the most
    // likely way for a correct answer to arrive from a copy/paste.
    const result = parse('  someone@widgetry.test  ');

    expect(result.success).toBe(true);
    expect(result.data?.confirmEmail, 'the trimmed value is what reaches the handler').toBe(
      'someone@widgetry.test',
    );
  });

  it('accepts different casing, and leaves the comparison to the handler', () => {
    // Case folding is the handler's job (it lowercases both sides); the schema
    // must not reject the value before it gets there.
    const result = parse('  SomeOne@Widgetry.TEST ');

    expect(result.success).toBe(true);
    expect(result.data?.confirmEmail).toBe('SomeOne@Widgetry.TEST');
  });

  it('still rejects things that are not addresses', () => {
    for (const bad of ['not-an-email', '   ', '', 'a@', '@b.test', 'a b@c.test']) {
      expect(parse(bad).success, `"${bad}" should be rejected`).toBe(false);
    }
  });

  it('rejects a missing or non-string value', () => {
    for (const bad of [undefined, null, 42, {}, ['a@b.test']]) {
      expect(parse(bad).success, `${JSON.stringify(bad)} should be rejected`).toBe(false);
    }
  });

  it('ignores unknown extra fields rather than failing on them', () => {
    // Zod objects strip by default. Worth pinning: a client sending a stray
    // field should not be told its deletion request is malformed.
    const result = DeleteAccountRequest.safeParse({
      confirmEmail: 'someone@widgetry.test',
      reason: 'moving on',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ confirmEmail: 'someone@widgetry.test' });
  });
});
