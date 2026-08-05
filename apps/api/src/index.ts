// apps/api/src/index.ts
//
// Process entry for the api service: validate env, build the server, listen,
// and shut down cleanly when Railway sends SIGTERM on redeploy.

import { buildServer } from './server.js';
import { loadEnv } from './env.js';

async function main(): Promise<void> {
  // Before anything else - a missing BETTER_AUTH_SECRET should kill the process
  // here, not surface as a broken session three requests later.
  const env = loadEnv();

  const fastify = await buildServer();

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      fastify.log.info({ signal }, 'shutting down');
      void fastify.close().then(
        () => process.exit(0),
        (err) => {
          fastify.log.error({ err }, 'error during shutdown');
          process.exit(1);
        },
      );
    });
  }

  await fastify.listen({ host: env.HOST, port: env.PORT });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
