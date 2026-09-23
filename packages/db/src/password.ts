// packages/db/src/password.ts
//
// Argon2id password hashing. Better-Auth defaults to scrypt, so the api
// overrides it explicitly with these functions (Eng §11.5). Parameters are
// OWASP's baseline profile and are a LOCKED decision (#7): 19 MiB / t=2 / p=1.
// Do not raise without benchmark evidence against the 100-concurrent-user
// target.
//
// WHY THIS LIVES IN packages/db AND NOT IN apps/api.
//
// It has two callers: the api, which hands these to Better-Auth, and the demo
// seed, which writes the `account` row itself and therefore has to produce a
// hash Better-Auth's verifier will accept. Those must use identical parameters
// or the seeded demo account cannot sign in - a failure that would surface
// during a presentation, not during a test run.
//
// One definition, imported by both, is the only arrangement where that cannot
// drift. apps/api/src/auth/password.ts re-exports these so the api's own import
// path and its Eng §11.5 parameter test are unchanged.

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
