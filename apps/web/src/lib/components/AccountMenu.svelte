<!--
  Account menu (SCP-027, US-A4 / EX-14, Screen Inventory §5.2).

  The only affordance for signing out. /sign-out has existed since EX-14 but
  was reachable from nowhere except the /dev page, which is 404'd outside
  development (#230) - so in a production build there was no way to end a
  session at all.

  Skeleton's Popover rather than a hand-rolled dropdown: it is Zag-backed, so
  Escape-to-close, click-outside, return-focus and the trigger's
  aria-expanded/aria-controls come from the library instead of from four more
  event listeners here.

  Sign-out is a real <form method="POST">, not a fetch:
    - /sign-out is POST-only on purpose (a link or a prefetch must never end a
      session), and a form action inherits SvelteKit's same-origin check.
    - It works with JavaScript off, which is the same bar VerifyEmailFooter's
      resend control is held to.
-->
<script lang="ts">
  import { Popover } from '@skeletonlabs/skeleton-svelte';
  import type { MeUser } from '@widgetry/shared';
  import { userInitial } from './app-header';

  let { user }: { user: MeUser } = $props();

  let open = $state(false);

  const initial = $derived(userInitial(user.name, user.email));
  const displayName = $derived(user.name.trim() || user.email);
</script>

<Popover
  {open}
  onOpenChange={(event) => (open = event.open)}
  positioning={{ placement: 'bottom-end' }}
  triggerBase="flex items-center gap-2 rounded-full p-1 pr-2.5 hover:bg-surface-200-800 focus-visible:outline-2 focus-visible:outline-primary-500"
  triggerAriaLabel="Account menu"
  contentBase="card bg-surface-50-950 border border-surface-200-800 rounded-xl shadow-xl w-64 p-2"
  zIndex="50"
>
  {#snippet trigger()}
    {#if user.image}
      <!-- Google sign-in supplies this (FR-1.3); email+password users have null. -->
      <img src={user.image} alt="" class="size-7 rounded-full object-cover" />
    {:else}
      <span
        class="flex size-7 items-center justify-center rounded-full bg-primary-500 text-xs font-semibold text-white"
        aria-hidden="true">{initial}</span
      >
    {/if}
    <span class="hidden max-w-32 truncate text-sm text-surface-950-50 sm:block">{displayName}</span>
  {/snippet}

  {#snippet content()}
    <div class="border-b border-surface-200-800 px-3 pt-1 pb-3">
      <p class="truncate text-sm font-medium text-surface-950-50">{displayName}</p>
      <p class="truncate font-mono text-xs text-surface-600-400">{user.email}</p>
    </div>

    <a
      href="/account"
      class="mt-1 block rounded-lg px-3 py-2 text-sm text-surface-950-50 hover:bg-surface-200-800"
      onclick={() => (open = false)}
    >
      Account settings
    </a>

    <form method="POST" action="/sign-out" class="mt-1">
      <button
        type="submit"
        class="w-full rounded-lg px-3 py-2 text-left text-sm text-surface-950-50 hover:bg-surface-200-800"
      >
        Sign out
      </button>
    </form>
  {/snippet}
</Popover>
