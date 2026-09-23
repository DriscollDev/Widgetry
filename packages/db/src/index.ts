// packages/db/src/index.ts
//
// Public surface of the data layer: the Drizzle client and the full schema.
// Schema design lives in Engineering Doc §5.

export { db, createDb } from './client.js';
// Argon2id at the Eng §11.5 locked parameters. Exported here because the api
// hands these to Better-Auth and the demo seed writes `account` rows directly;
// both must produce hashes the same verifier accepts.
export { hashPassword, verifyPassword } from './password.js';
export type { Database } from './client.js';
export * as schema from './schema/index.js';
export {
  CredentialDecryptError,
  decryptCredential,
  encryptCredential,
  parseMasterKey,
  type EncryptedCredential,
} from './credential-crypto.js';
