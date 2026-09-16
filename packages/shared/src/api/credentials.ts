// packages/shared/src/api/credentials.ts
//
// Contract for the widget credential endpoints (Eng §6.2), US-S1..S4:
//
//   PUT    /v1/widgets/:id/credential   set or replace the API key (US-S1, US-S4)
//   DELETE /v1/widgets/:id/credential   remove it (US-S3)
//
// Write-only by construction (FR-6.2, US-S2): the key goes in, and nothing that
// comes back contains it. The status response is what SCR-MOD-05 needs to draw
// the `•••••••• (saved)` placeholder (FR-6.3) - whether a key exists, and when
// it was saved.

import { z } from 'zod';

export const API_KEY_MAX_LENGTH = 2048;

/**
 * The key as typed. Printable ASCII only - it is sent as a header value or a
 * query parameter, and real API keys are ASCII - and no leading or trailing
 * spaces, which are almost always a copy-paste accident that would make every
 * request fail. Inner spaces are allowed so `Bearer <token>` works as a header
 * value.
 */
export const ApiKeyValue = z
  .string()
  .min(1, 'Enter an API key.')
  .max(API_KEY_MAX_LENGTH, `An API key can be at most ${API_KEY_MAX_LENGTH} characters.`)
  .regex(/^[\x20-\x7e]+$/, 'An API key can only contain printable ASCII characters.')
  .refine((value) => value.trim() === value, {
    message: 'Remove the spaces at the start or end of the API key.',
  });

export const PutCredentialRequest = z.strictObject({
  apiKey: ApiKeyValue,
});

export type PutCredentialRequest = z.infer<typeof PutCredentialRequest>;

/** Returned by both verbs. Never carries the key or any part of it. */
export const CredentialStatusResponse = z.object({
  widgetId: z.uuid(),
  hasCredential: z.boolean(),
  /** When the current key was saved; null once deleted. */
  savedAt: z.iso.datetime().nullable(),
});

export type CredentialStatusResponse = z.infer<typeof CredentialStatusResponse>;
