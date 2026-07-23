import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // Railway runs the SvelteKit app as a long-lived Node service (Eng Doc §3, §16.2).
    adapter: adapter(),
  },
};

export default config;
