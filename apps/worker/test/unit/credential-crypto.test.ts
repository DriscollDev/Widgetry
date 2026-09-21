// apps/worker/test/unit/credential-crypto.test.ts
//
// FR-6.1 / Eng §10.2: envelope encryption for `api_credentials`. The module
// lives in @widgetry/db; it is tested here because that package has no test
// runner and the worker is the only service that decrypts.

import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CredentialDecryptError,
  decryptCredential,
  encryptCredential,
  parseMasterKey,
  type EncryptedCredential,
} from '@widgetry/db';

const MK = randomBytes(32);
const WIDGET = '6f1c2a4e-8b7d-4c3a-9e5f-1a2b3c4d5e6f';
const OTHER_WIDGET = '0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b';
const SECRET = 'sk_live_abc123 with spaces';

describe('encryptCredential / decryptCredential', () => {
  it('round-trips', () => {
    const row = encryptCredential(SECRET, WIDGET, MK);
    expect(decryptCredential(row, WIDGET, MK).toString('utf8')).toBe(SECRET);
  });

  it('stores no plaintext in any column', () => {
    const row = encryptCredential(SECRET, WIDGET, MK);
    for (const column of Object.values(row)) {
      expect(column.includes(Buffer.from('sk_live'))).toBe(false);
    }
  });

  it('uses 12-byte IVs, 16-byte tags and a 32-byte wrapped DEK', () => {
    const row = encryptCredential(SECRET, WIDGET, MK);
    expect(row.ciphertextIv).toHaveLength(12);
    expect(row.dekIv).toHaveLength(12);
    expect(row.ciphertextAuthTag).toHaveLength(16);
    expect(row.dekAuthTag).toHaveLength(16);
    expect(row.encryptedDek).toHaveLength(32);
  });

  it('generates a fresh DEK and IVs every time (US-S4 re-keys the row)', () => {
    const a = encryptCredential(SECRET, WIDGET, MK);
    const b = encryptCredential(SECRET, WIDGET, MK);
    expect(a.encryptedDek.equals(b.encryptedDek)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(a.ciphertextIv.equals(b.ciphertextIv)).toBe(false);
    expect(a.dekIv.equals(b.dekIv)).toBe(false);
  });

  it('refuses a row moved onto another widget', () => {
    const row = encryptCredential(SECRET, WIDGET, MK);
    expect(() => decryptCredential(row, OTHER_WIDGET, MK)).toThrow(CredentialDecryptError);
  });

  it('refuses a different master key', () => {
    const row = encryptCredential(SECRET, WIDGET, MK);
    expect(() => decryptCredential(row, WIDGET, randomBytes(32))).toThrow(CredentialDecryptError);
  });

  it.each<keyof EncryptedCredential>([
    'ciphertext',
    'ciphertextIv',
    'ciphertextAuthTag',
    'encryptedDek',
    'dekIv',
    'dekAuthTag',
  ])('refuses a row with a tampered %s', (column) => {
    const row = encryptCredential(SECRET, WIDGET, MK);
    const tampered = Buffer.from(row[column]);
    tampered[0] = tampered[0]! ^ 0x01;
    expect(() => decryptCredential({ ...row, [column]: tampered }, WIDGET, MK)).toThrow(
      CredentialDecryptError,
    );
  });

  it.each(['ciphertextAuthTag', 'dekIv'] as const)(
    'refuses a truncated %s rather than accepting a shorter tag or IV',
    (column) => {
      const row = encryptCredential(SECRET, WIDGET, MK);
      expect(() =>
        decryptCredential({ ...row, [column]: row[column].subarray(0, 4) }, WIDGET, MK),
      ).toThrow(CredentialDecryptError);
    },
  );

  it('does not put any detail in the decrypt error', () => {
    const row = encryptCredential(SECRET, WIDGET, MK);
    try {
      decryptCredential(row, OTHER_WIDGET, MK);
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).toBe('stored credential could not be decrypted');
    }
  });
});

describe('parseMasterKey', () => {
  it('accepts 32 bytes of canonical base64', () => {
    const encoded = MK.toString('base64');
    expect(parseMasterKey(encoded).equals(MK)).toBe(true);
    expect(parseMasterKey(`  ${encoded}\n`).equals(MK)).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['too short', randomBytes(16).toString('base64')],
    ['too long', randomBytes(34).toString('base64')],
    ['not base64', '!'.repeat(44)],
    [
      'base64 with junk inside',
      `${MK.toString('base64').slice(0, 20)}*${MK.toString('base64').slice(20)}`,
    ],
    ['hex instead of base64', MK.toString('hex')],
  ])('rejects a key that is %s, without echoing it', (_label, value) => {
    try {
      parseMasterKey(value);
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).toContain('32 bytes');
      if (value.length > 8) expect((err as Error).message).not.toContain(value);
    }
  });
});
