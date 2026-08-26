import { describe, expect, it } from 'vitest';
import { EmailField, MIN_PASSWORD_LENGTH, PasswordField } from '@widgetry/shared';
import { fieldError, fullName, SignUpForm } from './auth-forms.js';

const VALID = {
  firstName: 'Adrian',
  lastName: 'D.',
  email: 'adrian@example.com',
  password: 'a-perfectly-fine-password',
};

describe('SignUpForm', () => {
  it('accepts a well-formed submission', () => {
    expect(SignUpForm.safeParse(VALID).success).toBe(true);
  });

  it('trims whitespace off the name and email fields', () => {
    const parsed = SignUpForm.parse({ ...VALID, firstName: '  Adrian  ', email: ' A@B.co ' });
    expect(parsed.firstName).toBe('Adrian');
    expect(parsed.email).toBe('A@B.co');
  });

  it.each([
    ['missing first name', { firstName: '   ' }],
    ['missing last name', { lastName: '' }],
    ['email with no @', { email: 'adrian.example.com' }],
    ['password one char short', { password: 'a'.repeat(MIN_PASSWORD_LENGTH - 1) }],
  ])('rejects %s', (_label, override) => {
    expect(SignUpForm.safeParse({ ...VALID, ...override }).success).toBe(false);
  });
});

describe('password policy (FR-1.5)', () => {
  // The pre-wiring form demanded a lowercase, an uppercase, a number and a
  // symbol. The api never did - it asks for length plus a breach-corpus miss.
  // These two cases are the ones the old rules got wrong in both directions.
  it('accepts a long all-lowercase passphrase', () => {
    expect(PasswordField.safeParse('correct horse battery staple').success).toBe(true);
  });

  it('rejects a short password however many character classes it uses', () => {
    expect(PasswordField.safeParse('Aa1!Aa1!').success).toBe(false);
  });

  it('enforces exactly the shared floor', () => {
    expect(PasswordField.safeParse('x'.repeat(MIN_PASSWORD_LENGTH)).success).toBe(true);
    expect(PasswordField.safeParse('x'.repeat(MIN_PASSWORD_LENGTH - 1)).success).toBe(false);
  });
});

describe('fullName', () => {
  it('joins the two fields Better-Auth stores as one', () => {
    expect(fullName('Adrian', 'D.')).toBe('Adrian D.');
  });

  it('does not leave stray whitespace when a part is blank', () => {
    expect(fullName('  Adrian ', '  ')).toBe('Adrian');
  });
});

describe('fieldError', () => {
  it('returns an empty string when the value passes', () => {
    expect(fieldError(EmailField, 'adrian@example.com')).toBe('');
  });

  it('surfaces the first message so a field can render it on blur', () => {
    expect(fieldError(EmailField, 'nope')).toBe('Enter a valid email address.');
  });
});
