<!--
  Route: /verify-email - SCR-AUTH-05 (Screen Inventory §5.1). US-A6 / FR-1.7.

  A landing page, not a verifier - see +page.server.ts for why. Three states,
  and the middle one is the reason this page needs care:

    verified   the link worked and auto-sign-in gave this browser a session
    signed in
    but not    the session exists and the address still is not verified, which
    verified   means the link did not take
    anonymous  no session here - most often because the link was opened in a
               different browser than the one signed in, which is NOT a failure

  The anonymous copy deliberately does not claim failure. Opening an email on a
  phone while signed in on a laptop is the common case, and telling that user
  "verification failed" would send them round the loop again for nothing.
-->
<script lang="ts">
  import BrandMark from '$lib/components/BrandMark.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  let verified = $derived(data.signedIn && data.emailVerified);
</script>

<svelte:head>
  <title>Email verification · Widgetry</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
  <div class="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-8 shadow-xl">
    <div class="mb-6 flex items-center gap-2">
      <BrandMark size={32} />
      <span class="text-sm font-medium text-neutral-200">Widgetry</span>
    </div>

    {#if verified}
      <h1 class="text-2xl font-semibold text-white">You're verified</h1>
      <p class="mt-3 text-sm text-neutral-300">
        {#if data.email}
          <strong class="text-neutral-100">{data.email}</strong> is confirmed.
        {:else}
          Your email address is confirmed.
        {/if}
        Everything's ready.
      </p>
      <a
        href="/boards"
        class="mt-5 inline-block w-full rounded-lg bg-blue-600 py-2.5 text-center text-sm font-medium text-white hover:bg-blue-500"
      >
        Go to your boards
      </a>
    {:else if data.signedIn}
      <h1 class="text-2xl font-semibold text-white">Not verified yet</h1>
      <p class="mt-3 text-sm text-neutral-300">
        You're signed in, but this address still isn't confirmed. The link may have expired -
        they're good for an hour.
      </p>
      <p class="mt-3 text-sm text-neutral-400">
        You can request a fresh one from
        <a href="/account" class="text-blue-400 hover:text-blue-300">account settings</a>.
      </p>
      <a
        href="/boards"
        class="mt-5 inline-block w-full rounded-lg border border-neutral-700 bg-neutral-800/60 py-2.5 text-center text-sm text-neutral-200 hover:bg-neutral-800"
      >
        Continue to your boards
      </a>
    {:else}
      <h1 class="text-2xl font-semibold text-white">Thanks for confirming</h1>
      <p class="mt-3 text-sm text-neutral-300">
        If you opened this link on a different device than the one you're signed in on, that's
        fine - your address is confirmed either way. Sign in to carry on.
      </p>
      <a
        href="/sign-in"
        class="mt-5 inline-block w-full rounded-lg bg-blue-600 py-2.5 text-center text-sm font-medium text-white hover:bg-blue-500"
      >
        Sign in
      </a>
    {/if}
  </div>
</div>
