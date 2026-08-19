// apps/api/src/plugins/ownership.ts
//
// Request decorations for the EX-17 gate. The pre-handlers themselves live in
// lib/ownership.ts; this only reserves the properties they populate.
//
// Declaring them up front (rather than assigning onto the request ad hoc) keeps
// every request the same hidden class, which is the shape Fastify optimises
// for, and gives the `| null` that forces a handler to acknowledge the gate
// might not have run.

import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import type { Board, Widget } from '../lib/ownership.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `requireBoardOwnership`. Null on routes without that pre-handler. */
    board: Board | null;
    /** Set by `requireWidgetOwnership`. Null on routes without that pre-handler. */
    widget: Widget | null;
  }
}

export const ownershipPlugin = fp(
  async function ownershipPlugin(fastify: FastifyInstance) {
    fastify.decorateRequest('board', null);
    fastify.decorateRequest('widget', null);
  },
  { name: 'widgetry-ownership' },
);
