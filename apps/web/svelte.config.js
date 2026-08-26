import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // Railway runs the SvelteKit app as a long-lived Node service (Eng Doc §3, §16.2).
    adapter: adapter(),

    // NOTE: `env: { dir: '../..' }` looks like the right way to reach the
    // workspace-root `.env`, but it makes SvelteKit run Vite's `loadEnv` over
    // that directory, which picks up NODE_ENV=development and turns production
    // builds into development ones. vite.config.ts reads the two variables the
    // web service needs directly instead - see the comment there.
  },
};

export default config;
