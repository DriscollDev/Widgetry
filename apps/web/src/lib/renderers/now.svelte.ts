// apps/web/src/lib/renderers/now.svelte.ts
//
// A reactive "current time" for client-local widgets (Story #223, Task #228).
// Clock and Date/Time are purely local (Eng 7.2): they read the browser clock and
// need no polling, snapshots or server. One timer per mounted widget, cleared
// when it unmounts.

import { onDestroy } from 'svelte';

export function useNow(intervalMs = 1000): { readonly value: Date } {
  let ms = $state(Date.now());
  const timer = setInterval(() => {
    ms = Date.now();
  }, intervalMs);
  onDestroy(() => clearInterval(timer));

  return {
    get value() {
      // A fresh, never-mutated Date built from the reactive number, so SvelteDate's
      // mutation tracking has nothing to add here.
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      return new Date(ms);
    },
  };
}
