// apps/api/src/auth/password.ts
//
// Argon2id password hashing for Better-Auth. Better-Auth defaults to scrypt, so
// we override it explicitly (Eng §11.5). Parameters are OWASP's baseline profile
// and are a LOCKED decision (#7): 19 MiB / t=2 / p=1. Do not raise without
// benchmark evidence against the 100-concurrent-user target.

import { hash, verify, type Algorithm } from '@node-rs/argon2';

// Algorithm is an ambient const enum; referencing its members trips
// isolatedModules, so use the value (Argon2id === 2) cast to the type.
const ARGON2ID = 2 as Algorithm;

const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19456, // KiB == 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

/** Better-Auth password.hash: (password) => Promise<encodedHash>. */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/**
 * Better-Auth password.verify: ({ password, hash }) => Promise<boolean>.
 * Argon2 parameters are embedded in the encoded hash, so verify needs no opts.
 */
export async function verifyPassword({
  password,
  hash: encoded,
}: {
  password: string;
  hash: string;
}): Promise<boolean> {
  return verify(encoded, password);
}
