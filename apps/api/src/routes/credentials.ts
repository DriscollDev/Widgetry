// apps/api/src/routes/credentials.ts
//
// The widget credential verbs from the Eng §6.2 catalog - F9.1/F9.2:
//
//   PUT    /v1/widgets/:id/credential   set or replace   US-S1, US-S4, FR-6.1
//   DELETE /v1/widgets/:id/credential   remove           US-S3
//
// Write-only (FR-6.2, US-S2). The plaintext key exists in this process only
// between parsing the request body and `encryptCredential` returning; it is
// never logged (the request body is not part of the request log line), never
// stored, and never in a response. Decryption happens only in the worker
// (Eng §10.2 step 4) - nothing here calls `decryptCredential`.
//
// Both routes carry `requireWidgetOwnership` (Eng §11.7), so a widget the
// caller does not own is a 404 before the body is even read.

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, encryptCredential, schema } from '@widgetry/db';
import {
  ApiErrorCode,
  type CredentialStatusResponse,
  PutCredentialRequest,
} from '@widgetry/shared';
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { env } from '../env.js';
import { ApiError, validationFailed } from '../lib/errors.js';
import { findOwnedWidget, requireWidgetOwnership } from '../lib/ownership.js';
import { requireSession } from '../lib/session.js';

/**
 * Only the Custom JSON widget sends a user-configured request (US-C2). A key
 * stored on any other type would never be used, and a user would reasonably
 * believe it was.
 */
const CREDENTIAL_WIDGET_TYPES: readonly string[] = ['custom_json'];

/** The caller's widget ids, as a subquery - the ownership scope for a write. */
function ownedWidgetIds(userId: string) {
  return db
    .select({ id: schema.widgets.id })
    .from(schema.widgets)
    .innerJoin(schema.boards, eq(schema.widgets.boardId, schema.boards.id))
    .where(eq(schema.boards.userId, userId));
}

export async function credentialRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * PUT /v1/widgets/:id/credential - set or replace. 200 with the status.
   *
   * Replacing is an upsert on the UNIQUE `widget_id` with a fresh DEK, so the
   * old ciphertext is overwritten rather than kept alongside.
   */
  fastify.put(
    '/v1/widgets/:id/credential',
    { preHandler: requireWidgetOwnership },
    async (request): Promise<CredentialStatusResponse> => {
      const { user } = requireSession(request);
      const widget = request.widget!;

      const parsed = PutCredentialRequest.safeParse(request.body);
      if (!parsed.success) {
        throw validationFailed(parsed.error, 'The API key could not be saved.');
      }

      if (!CREDENTIAL_WIDGET_TYPES.includes(widget.widgetType)) {
        throw validationFailed(
          new ZodError([
            {
              code: 'custom',
              path: ['apiKey'],
              message: 'Only custom widgets can store an API key.',
            },
          ]),
          'The API key could not be saved.',
        );
      }

      const sealed = encryptCredential(parsed.data.apiKey, widget.id, env.MASTER_ENCRYPTION_KEY);

      const saved = await db.transaction(async (tx) => {
        // Re-affirm ownership immediately before the write, as PATCH does: the
        // widget id below must come from a row this user owns right now.
        const owned = await findOwnedWidget(widget.id, user.id);
        if (!owned) throw new ApiError(404, ApiErrorCode.NOT_FOUND, 'Widget not found.');

        const [row] = await tx
          .insert(schema.apiCredentials)
          .values({ widgetId: owned.id, ...sealed })
          .onConflictDoUpdate({
            target: schema.apiCredentials.widgetId,
            // `created_at` is the time the CURRENT key was saved (the table has
            // no separate updated_at), which is what FR-6.3's "(saved)" shows.
            set: { ...sealed, createdAt: sql`now()` },
          })
          .returning({ createdAt: schema.apiCredentials.createdAt });
        return row!;
      });

      request.log.info({ widgetId: widget.id }, 'credential saved (US-S1/US-S4)');

      return {
        widgetId: widget.id,
        hasCredential: true,
        savedAt: saved.createdAt.toISOString(),
      };
    },
  );

  /**
   * DELETE /v1/widgets/:id/credential - remove. 200 with the status.
   *
   * Idempotent: deleting a key that is not there answers the same, since the
   * state the caller asked for is the state that now holds.
   */
  fastify.delete(
    '/v1/widgets/:id/credential',
    { preHandler: requireWidgetOwnership },
    async (request): Promise<CredentialStatusResponse> => {
      const { user } = requireSession(request);
      const widget = request.widget!;

      const deleted = await db
        .delete(schema.apiCredentials)
        .where(
          and(
            eq(schema.apiCredentials.widgetId, widget.id),
            inArray(schema.apiCredentials.widgetId, ownedWidgetIds(user.id)),
          ),
        )
        .returning({ id: schema.apiCredentials.id });

      request.log.info(
        { widgetId: widget.id, existed: deleted.length > 0 },
        'credential deleted (US-S3)',
      );

      return { widgetId: widget.id, hasCredential: false, savedAt: null };
    },
  );
}
