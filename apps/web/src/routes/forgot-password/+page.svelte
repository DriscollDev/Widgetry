<!--
  Route: /forgot-password - SCR-AUTH-03 (Screen Inventory §5.1). US-A6.

  Submits to the form action in +page.server.ts, so the screen works before
  hydration; `use:enhance` upgrades it in place.

  The success state says "if that address has an account" rather than "we sent
  you an email", and it says it whether or not one exists. See the action's
  header for why that wording is load-bearing rather than coy: any phrasing
  that confirms an account turns this page into an account-enumeration oracle.

  States covered (§5.1): pristine, filling, submitting, sent, rate-limited.
  There is deliberately no not-found state.
-->
<script lang="ts">
  import BrandMark from '$lib/components/BrandMark.svelte';
  import { enhance } from '$app/forms';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // svelte-ignore state_referenced_locally
  let email = $state(form?.email ?? '');
  let emailError = $state('');
  let submitting = $state(false);

  // Once the acknowledgment is showing, the form is done. Re-submitting the
  // same address would only burn a rate-limit slot.
  let sent = $derived(form?.sent === true);

  function validateEmail() {
    emailError = email.trim() ? '' : 'Email address is required.';
    return !emailError;
  }
</script>

<svelte:head>
  <title>Reset your password · Widgetry</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
  <div class="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-8 shadow-xl">
    <div class="mb-6 flex items-center gap-2">
      <BrandMark size={32} />
      <span class="text-sm font-medium text-neutral-200">Widgetry</span>
    </div>

    {#if sent}
      <h1 class="text-2xl font-semibold text-white">Check your email</h1>
      <p class="mt-3 text-sm text-neutral-300">
        If <strong class="text-neutral-100">{form?.email}</strong> has an account, a link to set a new
        password is on its way. It expires in an hour.
      </p>
      <p class="mt-3 text-sm text-neutral-400">
        Nothing arrived? Check your spam folder, then
        <a href="/forgot-password" class="text-blue-400 hover:text-blue-300">try again</a>.
      </p>
    {:else}
      <h1 class="text-2xl font-semibold text-white">Reset your password</h1>
      <p class="mt-1 text-sm text-neutral-400">We'll email you a link to set a new one.</p>

      {#if data.signedIn}
        <p
          class="mt-4 rounded-lg border border-neutral-700 bg-neutral-800/60 px-3 py-2 text-sm text-neutral-300"
        >
          You're signed in. If you remember your current password, you can change it from
          <a href="/account" class="text-blue-400 hover:text-blue-300">account settings</a> instead.
        </p>
      {/if}

      {#if form?.message}
        <p
          class="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
          role="alert"
        >
          {form.message}
        </p>
      {/if}

      <form
        class="mt-6 space-y-4"
        method="POST"
        novalidate
        use:enhance={({ cancel }) => {
          if (!validateEmail()) return cancel();
          submitting = true;
          return async ({ update }) => {
            await update({ reset: false });
            submitting = false;
          };
        }}
      >
        <div>
          <label for="email" class="mb-1.5 block text-sm text-neutral-300">Email address</label>
          <input
            id="email"
            name="email"
            type="email"
            autocomplete="email"
            placeholder="you@example.com"
            bind:value={email}
            onblur={validateEmail}
            aria-invalid={!!(emailError || form?.fieldErrors?.email)}
            class="w-full rounded-lg border bg-neutral-800/60 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            class:border-neutral-700={!(emailError || form?.fieldErrors?.email)}
            class:border-red-500={!!(emailError || form?.fieldErrors?.email)}
          />
          {#if emailError || form?.fieldErrors?.email}
            <p class="mt-1 text-xs text-red-400">{emailError || form?.fieldErrors?.email}</p>
          {/if}
        </div>

        <button
          type="submit"
          disabled={submitting}
          class="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Sending…' : 'Email me a link'}
        </button>
      </form>
    {/if}

    <p class="mt-6 text-center text-sm text-neutral-400">
      <a href="/sign-in" class="text-blue-400 hover:text-blue-300">Back to sign in</a>
    </p>
  </div>
</div>
