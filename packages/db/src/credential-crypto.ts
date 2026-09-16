// packages/db/src/credential-crypto.ts
//
// FR-6.1 / Eng §10.2: envelope encryption for `api_credentials`, with Node's
// built-in crypto and nothing else.
//
//   master key (MK, env)  --AES-256-GCM-->  per-record DEK  (encrypted_dek, dek_iv, dek_auth_tag)
//   per-record DEK        --AES-256-GCM-->  API key         (ciphertext, ciphertext_iv, ciphertext_auth_tag)
//
// Lives in the data package because it defines the storage format of a table
// this package owns, and both services that touch that table depend on it: the
// api encrypts on write, the worker decrypts for one outbound request (§10.2
// step 4). The api never calls `decryptCredential`.
//
// Both GCM operations authenticate the owning widget's id as additional data.
// A row copied onto another widget - by anyone with write access to the table
// but not the master key - fails to decrypt instead of quietly authenticating
// that widget's requests with someone else's key.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
/** NIST SP 800-38D's recommended GCM nonce length. */
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

/** The six bytea columns of an `api_credentials` row (Eng §5.2). */
export interface EncryptedCredential {
  ciphertext: Buffer;
  ciphertextIv: Buffer;
  ciphertextAuthTag: Buffer;
  encryptedDek: Buffer;
  dekIv: Buffer;
  dekAuthTag: Buffer;
}

/**
 * Parse `MASTER_ENCRYPTION_KEY`. Throws unless it is canonical base64 for
 * exactly 32 bytes: Node's decoder skips characters it does not understand, so
 * a truncated or mangled value would otherwise become a shorter key without
 * complaint. The message never includes the value.
 */
export function parseMasterKey(base64: string): Buffer {
  const trimmed = base64.trim();
  const key = Buffer.from(trimmed, 'base64');
  if (key.length !== KEY_BYTES || key.toString('base64') !== trimmed) {
    throw new Error(
      `MASTER_ENCRYPTION_KEY must be ${KEY_BYTES} bytes, base64-encoded. Generate one with: ` +
        `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }
  return key;
}

function seal(key: Buffer, plaintext: Buffer, aad: Buffer) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_BYTES });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

function open(key: Buffer, ciphertext: Buffer, iv: Buffer, authTag: Buffer, aad: Buffer): Buffer {
  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
    throw new CredentialDecryptError();
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_BYTES });
  decipher.setAAD(aad);
  decipher.setAuthTag(authTag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new CredentialDecryptError();
  }
}

/**
 * The stored credential could not be decrypted: tampered, moved to another
 * widget, or written under a different master key. Deliberately carries no
 * detail.
 */
export class CredentialDecryptError extends Error {
  constructor() {
    super('stored credential could not be decrypted');
    this.name = 'CredentialDecryptError';
  }
}

/** Eng §10.2 step 3. A fresh DEK per call, so replacing a key (US-S4) re-keys the row. */
export function encryptCredential(
  plaintext: string,
  widgetId: string,
  masterKey: Buffer,
): EncryptedCredential {
  const aad = Buffer.from(widgetId, 'utf8');
  const dek = randomBytes(KEY_BYTES);
  const secret = Buffer.from(plaintext, 'utf8');
  try {
    const data = seal(dek, secret, aad);
    const wrapped = seal(masterKey, dek, aad);
    return {
      ciphertext: data.ciphertext,
      ciphertextIv: data.iv,
      ciphertextAuthTag: data.authTag,
      encryptedDek: wrapped.ciphertext,
      dekIv: wrapped.iv,
      dekAuthTag: wrapped.authTag,
    };
  } finally {
    // Best effort (§10.2): the caller's string copy cannot be wiped.
    dek.fill(0);
    secret.fill(0);
  }
}

/**
 * Eng §10.2 step 4. Returns the plaintext as a Buffer so the caller can zero it
 * once the outbound request is done. Throws CredentialDecryptError on any
 * authentication failure.
 */
export function decryptCredential(
  row: EncryptedCredential,
  widgetId: string,
  masterKey: Buffer,
): Buffer {
  const aad = Buffer.from(widgetId, 'utf8');
  const dek = open(masterKey, row.encryptedDek, row.dekIv, row.dekAuthTag, aad);
  try {
    if (dek.length !== KEY_BYTES) throw new CredentialDecryptError();
    return open(dek, row.ciphertext, row.ciphertextIv, row.ciphertextAuthTag, aad);
  } finally {
    dek.fill(0);
  }
}
