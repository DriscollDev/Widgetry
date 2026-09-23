// apps/api/src/auth/password.ts
//
// Argon2id password hashing for Better-Auth (Eng §11.5, locked decision #7:
// 19 MiB / t=2 / p=1).
//
// The implementation moved to @widgetry/db so the demo seed can produce hashes
// Better-Auth's verifier accepts - it writes the `account` row directly rather
// than going through the sign-up endpoint, and two copies of the parameters
// would be two things to keep in step. See packages/db/src/password.ts.
//
// This file stays as the api's import path: auth.ts and the Eng §11.5
// parameter test both reference it, and the re-export keeps the parameters
// asserted from the api's side as that section requires.

export { hashPassword, verifyPassword } from '@widgetry/db';
