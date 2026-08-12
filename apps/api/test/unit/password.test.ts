// apps/api/test/unit/password.test.ts
//
// Eng §11.5 assigns Sprint 1 an explicit task: "add a unit test asserting the
// parameters are what we expect, so a Better-Auth upgrade cannot silently
// change them." That is this file.
//
// It asserts against the *encoded hash string*, not against our own constants -
// reading back the constants would pass even if @node-rs/argon2 ignored them.

import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/auth/password.js';

/** `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<digest>` */
const ENCODED =
  /^\$argon2(?<variant>id|i|d)\$v=(?<version>\d+)\$m=(?<m>\d+),t=(?<t>\d+),p=(?<p>\d+)\$/;

describe('argon2id password hashing (Eng §11.5, locked decision #7)', () => {
  it('hashes at the OWASP baseline profile: argon2id, 19 MiB, t=2, p=1', async () => {
    const encoded = await hashPassword('correct horse battery staple');
    const groups = ENCODED.exec(encoded)?.groups;

    expect(groups, `unrecognised hash encoding: ${encoded}`).toBeDefined();
    expect(groups!.variant).toBe('id');
    expect(Number(groups!.version)).toBe(19);
    expect(Number(groups!.m)).toBe(19456); // KiB == 19 MiB
    expect(Number(groups!.t)).toBe(2);
    expect(Number(groups!.p)).toBe(1);
  });

  it('salts each hash, so identical passwords produce different digests', async () => {
    const password = 'correct horse battery staple';
    expect(await hashPassword(password)).not.toBe(await hashPassword(password));
  });

  it('verifies a matching password and rejects a non-matching one', async () => {
    const encoded = await hashPassword('correct horse battery staple');

    await expect(
      verifyPassword({ password: 'correct horse battery staple', hash: encoded }),
    ).resolves.toBe(true);

    await expect(
      verifyPassword({ password: 'Correct horse battery staple', hash: encoded }),
    ).resolves.toBe(false);
  });

  it('never returns the plaintext inside the encoded hash (FR-1.2)', async () => {
    const password = 'a-very-distinctive-plaintext-value';
    expect(await hashPassword(password)).not.toContain(password);
  });
});
