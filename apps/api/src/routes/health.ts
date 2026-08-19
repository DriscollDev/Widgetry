// apps/api/src/routes/health.ts
//
// GET /v1/health - Railway's liveness probe for the api service (Eng §16.3),
// and one of the two public routes in the §6.1 catalog.
//
// Deliberately does NOT touch Postgres or Redis: Railway restarts a service
// that fails its healthcheck, and a brief database blip should not cascade into
// an api restart loop. A dependency-aware /v1/ready is the place for that if we
// ever need it.

import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@widgetry/shared';

const startedAt = Date.now();

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  // The one route that opts out of the §6.4 default limit. Railway restarts a
  // service whose healthcheck fails, so throttling the probe would turn a burst
  // of traffic from one IP into an api restart loop. Safe to leave open: the
  // handler touches no I/O and returns a fixed-size body.
  fastify.get('/v1/health', { config: { rateLimit: false } }, async (): Promise<HealthResponse> => {
    return {
      status: 'ok',
      service: 'api',
      version: process.env.npm_package_version ?? '0.0.0',
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    };
  });
}
