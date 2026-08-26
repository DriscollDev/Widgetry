import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

/**
 * Pull the two variables the web service needs out of the workspace-root
 * `.env` (documented in `.env.example`) and into `process.env`, from where
 * `$env/dynamic/private` picks them up. pnpm runs this package with
 * cwd = apps/web, so nothing would find the root file otherwise.
 *
 * Why not `envDir` (Vite) or `kit.env.dir` (SvelteKit): both end up calling
 * Vite's `loadEnv` on that directory, and `loadEnv` copies any `NODE_ENV` it
 * finds into `VITE_USER_NODE_ENV`. The root `.env` sets NODE_ENV=development
 * for the api, so either option silently turns `vite build` into a development
 * build - `import.meta.env.DEV === true`, dev error pages with stack traces,
 * no production optimisations - which is exactly what you do not want shipping
 * to Railway. Reading the file directly keeps Vite's mode resolution alone.
 *
 * The allowlist is deliberate and doubles as least privilege: the web process
 * has no business holding DATABASE_URL, BETTER_AUTH_SECRET or RESEND_API_KEY,
 * and this makes sure a shared `.env` cannot hand them over by accident.
 */
const WEB_ENV_KEYS = ['APP_ORIGIN', 'INTERNAL_API_URL'];

function loadRootEnv(): void {
  const path = fileURLToPath(new URL('../../.env', import.meta.url));
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (!key || !WEB_ENV_KEYS.includes(key)) continue;
    // Anything already in the real environment wins - Railway and CI inject
    // the correct per-environment values and must stay authoritative.
    if (process.env[key] !== undefined) continue;

    process.env[key] = (rawValue ?? '').trim().replace(/^(['"])(.*)\1$/, '$2');
  }
}

loadRootEnv();

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
    environment: 'node',
  },
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
});
