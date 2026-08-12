// packages/shared/src/api/health.ts
//
// Contract for GET /v1/health (Eng §6.2, §16.3). Public - no session required.
// Railway's healthcheck only reads the status code; the body exists so a human
// (or a smoke test) can tell which build is live.

import { z } from 'zod';

export const HealthResponse = z.object({
  status: z.literal('ok'),
  service: z.literal('api'),
  version: z.string(),
  uptimeSeconds: z.number(),
});

export type HealthResponse = z.infer<typeof HealthResponse>;
