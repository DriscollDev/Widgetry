<!--
  Route: /reset-password - SCR-AUTH-04 (Screen Inventory §5.1). US-A6.

  The password rules shown here come from the same `PasswordField` the api
  validates with, via ResetPasswordForm - so the form cannot reject a password
  the api would accept, or accept one it would reject.

  States covered (§5.1): no-token, pristine, filling, submitting, invalid-token,
  rate-limited. Success is a redirect to /sign-in?reset=1 rather than a state
  here, because the api kills every session on reset and there is nothing to
  land in.
-->
<script lang="ts">
  import BrandMark from '$lib/components/BrandMark.svelte';
  import { enhance } from '$app/forms';
  import { MIN_PASSWORD_LENGTH } from '@widgetry/shared';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let newPassword = $state('');
  let confirmPassword = $state('');
  let newPasswordError = $state('');
  let confirmError = $state('');
  let submitting = $state(false);

  function validateNewPassword() {
    newPasswordError = !newPassword
      ? 'Enter a new password.'
      : newPassword.length < MIN_PASSWORD_LENGTH
        ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
        : '';
    return !newPasswordError;
  }

  function validateConfirm() {
    confirmError = !confirmPassword
      ? 'Confirm your new password.'
      : confirmPassword !== newPassword
        ? 'Passwords do not match.'
        : '';
    return !confirmError;
  }
</script>

<svelte:head>
  <title>Set a new password · Widgetry</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
  <div class="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-8 shadow-xl">
    <div class="mb-6 flex items-center gap-2">
      <BrandMark size={32} />
      <span class="text-sm font-medium text-neutral-200">Widgetry</span>
    </div>

    {#if !data.hasToken}
      <h1 class="text-2xl font-semibold text-white">This link is incomplete</h1>
      <p class="mt-3 text-sm text-neutral-300">
        Reset links carry a one-time token, and this one has none. It may have been cut short by
        your email client.
      </p>
      <p class="mt-4">
        <a
          href="/forgot-password"
          class="inline-block w-full rounded-lg bg-blue-600 py-2.5 text-center text-sm font-medium text-white hover:bg-blue-500"
        >
          Request a new link
        </a>
      </p>
    {:else}
      <h1 class="text-2xl font-semibold text-white">Set a new password</h1>
      <p class="mt-1 text-sm text-neutral-400">
        At least {MIN_PASSWORD_LENGTH} characters. You'll sign in with it afterwards.
      </p>

      {#if form?.message}
        <p
          class="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
          role="alert"
        >
          {form.message}
          <a href="/forgot-password" class="text-blue-400 hover:text-blue-300">Request a new one</a
          >.
        </p>
      {/if}

      <form
        class="mt-6 space-y-4"
        method="POST"
        novalidate
        use:enhance={({ cancel }) => {
          const valid = [validateNewPassword(), validateConfirm()].every(Boolean);
          if (!valid) return cancel();
          submitting = true;
          return async ({ update }) => {
            await update({ reset: false });
            submitting = false;
          };
        }}
      >
        <!-- Straight from the query string, never inspected here - only the
             api can say whether it is still good. -->
        <input type="hidden" name="token" value={data.token} />

        <div>
          <label for="newPassword" class="mb-1.5 block text-sm text-neutral-300">
            New password
          </label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            autocomplete="new-password"
            bind:value={newPassword}
            onblur={validateNewPassword}
            aria-invalid={!!(newPasswordError || form?.fieldErrors?.newPassword)}
            class="w-full rounded-lg border bg-neutral-800/60 px-3 py-2 text-sm text-neutral-200 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            class:border-neutral-700={!(newPasswordError || form?.fieldErrors?.newPassword)}
            class:border-red-500={!!(newPasswordError || form?.fieldErrors?.newPassword)}
          />
          {#if newPasswordError || form?.fieldErrors?.newPassword}
            <p class="mt-1 text-xs text-red-400">
              {newPasswordError || form?.fieldErrors?.newPassword}
            </p>
          {/if}
        </div>

        <div>
          <label for="confirmPassword" class="mb-1.5 block text-sm text-neutral-300">
            Confirm new password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autocomplete="new-password"
            bind:value={confirmPassword}
            onblur={validateConfirm}
            aria-invalid={!!(confirmError || form?.fieldErrors?.confirmPassword)}
            class="w-full rounded-lg border bg-neutral-800/60 px-3 py-2 text-sm text-neutral-200 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            class:border-neutral-700={!(confirmError || form?.fieldErrors?.confirmPassword)}
            class:border-red-500={!!(confirmError || form?.fieldErrors?.confirmPassword)}
          />
          {#if confirmError || form?.fieldErrors?.confirmPassword}
            <p class="mt-1 text-xs text-red-400">
              {confirmError || form?.fieldErrors?.confirmPassword}
            </p>
          {/if}
        </div>

        <button
          type="submit"
          disabled={submitting}
          class="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Saving…' : 'Set new password'}
        </button>
      </form>
    {/if}

    <p class="mt-6 text-center text-sm text-neutral-400">
      <a href="/sign-in" class="text-blue-400 hover:text-blue-300">Back to sign in</a>
    </p>
  </div>
</div>
