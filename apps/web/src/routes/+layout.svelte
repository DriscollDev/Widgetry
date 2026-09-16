<script lang="ts">
  // Root layout - wraps every route.
  //
  // TODO (frontend): build the authenticated app shell here.
  //   - Persistent header / nav (logo, board switcher, account menu).
  //   - Skeleton UI layout primitives (AppBar / sidebar).
  //   - Auth-aware chrome: signed-out routes (/sign-in, /sign-up, ...) should
  //     render WITHOUT the app shell; signed-in routes get the full chrome.
  //
  // Keep the `import '../app.css'` (global Tailwind + Skeleton styles) and the
  // `{@render children()}` call - the app won't render without them.
  import '../app.css';
  import VerifyEmailFooter from '$lib/components/VerifyEmailFooter.svelte';
  import type { LayoutData } from './$types';
  import type { Snippet } from 'svelte';

  let { data, children }: { data: LayoutData; children: Snippet } = $props();

  // FR-1.7 / EX-16. `data.user` is null on the signed-out routes, so this is
  // also what keeps the notice off /sign-in and /sign-up without needing a
  // route allowlist.
  let showVerifyNotice = $derived(data.user !== null && !data.user.emailVerified);
</script>

{@render children()}

{#if showVerifyNotice && data.user}
  <VerifyEmailFooter email={data.user.email} dismissed={data.verifyNoticeDismissed} />
{/if}
