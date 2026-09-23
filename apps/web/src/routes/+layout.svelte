<script lang="ts">
  // Root layout - wraps every route.
  //
  // The app shell (SCP-027) is gated on `data.user`, not on a route allowlist:
  // `user` is null on every signed-out route, and `/` bounces a signed-in
  // visitor to their boards (routes/+page.server.ts), so the signed-out
  // screens keep their own chrome without this file having to know their
  // paths. Same trick the verify notice below already relies on.
  //
  // Still TODO (frontend): board switcher in the header, and Skeleton's
  // AppBar/sidebar primitives once there is a second axis of navigation to
  // justify them.
  //
  // Keep the `import '../app.css'` (global Tailwind + Skeleton styles) and the
  // `{@render children()}` call - the app won't render without them.
  import '../app.css';
  import { page } from '$app/state';
  import AppHeader from '$lib/components/AppHeader.svelte';
  import VerifyEmailFooter from '$lib/components/VerifyEmailFooter.svelte';
  import type { LayoutData } from './$types';
  import type { Snippet } from 'svelte';

  let { data, children }: { data: LayoutData; children: Snippet } = $props();

  // FR-1.7 / EX-16. `data.user` is null on the signed-out routes, so this is
  // also what keeps the notice off /sign-in and /sign-up without needing a
  // route allowlist.
  let showVerifyNotice = $derived(data.user !== null && !data.user.emailVerified);
</script>

{#if data.user}
  <AppHeader user={data.user} pathname={page.url.pathname} />
{/if}

{@render children()}

{#if showVerifyNotice && data.user}
  <VerifyEmailFooter email={data.user.email} dismissed={data.verifyNoticeDismissed} />
{/if}
