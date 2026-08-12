// apps/api/test/unit/email.test.ts
//
// EX-15. Two things worth pinning about the transactional emails: that the
// rendered message actually carries the tokenized link in both parts (an email
// that renders beautifully and drops the link is a broken FR-1.7/FR-1.8), and
// that a user-supplied display name cannot inject markup into the HTML part.

import { describe, expect, it, vi } from 'vitest';
import {
  passwordResetEmail,
  sendEmail,
  setEmailLogger,
  verificationEmail,
  type EmailLogger,
} from '../../src/email/index.js';

const URL_UNDER_TEST =
  'https://widgetry.example/v1/auth/verify-email?token=abc.def&callbackURL=%2Fboards';

function fakeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() } satisfies EmailLogger;
}

describe.each([
  ['verificationEmail (FR-1.7)', verificationEmail],
  ['passwordResetEmail (FR-1.8)', passwordResetEmail],
])('%s', (_label, render) => {
  const email = render({
    to: 'someone@widgetry.test',
    name: 'Ada',
    url: URL_UNDER_TEST,
    expiresInMinutes: 60,
  });

  it('addresses the recipient and carries a subject', () => {
    expect(email.to).toBe('someone@widgetry.test');
    expect(email.subject).toMatch(/widgetry/i);
  });

  it('includes the tokenized link in both the HTML and the text part', () => {
    // The HTML part escapes `&`, which is correct in an href and still the
    // same URL once parsed - so check the escaped form there.
    expect(email.html).toContain(URL_UNDER_TEST.replace(/&/g, '&amp;'));
    expect(email.text).toContain(URL_UNDER_TEST);
  });

  it('ships a plain-text alternative with no markup in it', () => {
    expect(email.text.length).toBeGreaterThan(0);
    expect(email.text).not.toMatch(/<[a-z]/i);
  });

  it('states the expiry, derived from the configured TTL', () => {
    expect(email.text).toContain('1 hour');
    expect(email.html).toContain('1 hour');

    const halfHour = render({
      to: 'a@b.test',
      name: null,
      url: URL_UNDER_TEST,
      expiresInMinutes: 30,
    });
    expect(halfHour.text).toContain('30 minutes');
  });

  it('escapes the display name, which is untrusted sign-up input', () => {
    const injected = render({
      to: 'a@b.test',
      name: '<script>alert(1)</script>',
      url: URL_UNDER_TEST,
      expiresInMinutes: 60,
    });

    expect(injected.html).not.toContain('<script>');
    expect(injected.html).toContain('&lt;script&gt;');
  });

  it('greets without a name when the account has none', () => {
    const anonymous = render({
      to: 'a@b.test',
      name: '  ',
      url: URL_UNDER_TEST,
      expiresInMinutes: 60,
    });
    expect(anonymous.text.startsWith('Hi,')).toBe(true);
  });
});

describe('sendEmail transport (EX-15)', () => {
  it('falls back to logging - not throwing - when no API key is configured', async () => {
    // test/setup.ts blanks RESEND_API_KEY, so this is the fallback path.
    const log = fakeLogger();
    setEmailLogger(log);

    await expect(
      sendEmail(
        verificationEmail({
          to: 'a@b.test',
          name: 'Ada',
          url: URL_UNDER_TEST,
          expiresInMinutes: 60,
        }),
      ),
    ).resolves.toBeUndefined();

    expect(log.warn).toHaveBeenCalledTimes(1);
    // The link has to be in the log line, or the offline dev flow is unusable.
    expect(JSON.stringify(log.warn.mock.calls[0])).toContain('token=abc.def');
  });
});
