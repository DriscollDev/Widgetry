<!--
  Route: /account - SCR-APP-03 (Screen Inventory §5.2).

  Sections: profile (read-only for now), security (change password).

  Not here yet, deliberately:
    - Editing name/email. §5.2 lists `editing-profile` / `saving` states, but
      there is no PATCH /v1/me to save into.
    - Resend verification. The control belongs beside the status shown below;
      it needs POST /v1/auth/send-verification-email, which is wired on the
      verify-notice branch. Fold the button in when that lands rather than
      adding a second copy of the call here.
    - Danger zone (delete account) - SCR-MOD-08 / FR-1.6, its own screen.
-->
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let submitting = $state(false);

  const memberSince = $derived(
    data.user
      ? new Date(data.user.createdAt).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : '',
  );
</script>

<svelte:head><title>Account · Widgetry</title></svelte:head>

<div class="mx-auto flex max-w-2xl flex-col gap-6 p-6">
  <header>
    <h1 class="text-2xl font-semibold text-surface-950-50">Account</h1>
    <p class="mt-1 text-sm text-surface-600-400">Your profile and sign-in security.</p>
  </header>

  {#if data.user}
    <section class="rounded-xl border border-surface-200-800 bg-surface-50-950 p-5">
      <h2 class="text-sm font-semibold text-surface-950-50">Profile</h2>

      <dl class="mt-4 divide-y divide-surface-200-800">
        <div class="flex items-center justify-between gap-4 py-3">
          <dt class="text-sm text-surface-600-400">Name</dt>
          <dd class="text-sm text-surface-950-50">{data.user.name}</dd>
        </div>

        <div class="flex items-center justify-between gap-4 py-3">
          <dt class="text-sm text-surface-600-400">Email</dt>
          <dd class="font-mono text-sm break-all text-surface-950-50">{data.user.email}</dd>
        </div>

        <div class="flex items-center justify-between gap-4 py-3">
          <dt class="text-sm text-surface-600-400">Email status</dt>
          <dd>
            <!-- Colour + icon + text, never colour alone (Design Principles §3.4). -->
            {#if data.user.emailVerified}
              <span
                class="flex items-center gap-1.5 rounded px-2 py-0.5 text-xs preset-filled-success-500"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="size-3"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="m5 13 4 4L19 7" />
                </svg>
                Verified
              </span>
            {:else}
              <span
                class="flex items-center gap-1.5 rounded px-2 py-0.5 text-xs preset-filled-warning-500"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="size-3"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                  stroke-linecap="round"
                  aria-hidden="true"
                >
                  <path d="M12 8v5M12 17h.01" />
                </svg>
                Not verified
              </span>
            {/if}
          </dd>
        </div>

        <div class="flex items-center justify-between gap-4 py-3">
          <dt class="text-sm text-surface-600-400">Member since</dt>
          <dd class="font-mono text-sm text-surface-950-50">{memberSince}</dd>
        </div>
      </dl>
    </section>

    <section class="rounded-xl border border-surface-200-800 bg-surface-50-950 p-5">
      <h2 class="text-sm font-semibold text-surface-950-50">Change password</h2>
      <p class="mt-1 text-xs text-surface-600-400">
        You will stay signed in here. Any other devices will be signed out.
      </p>

      {#if form?.changed}
        <p class="mt-4 rounded-lg px-3 py-2 text-sm preset-tonal-success" role="status">
          Password changed.
        </p>
      {/if}

      {#if form?.message}
        <p class="mt-4 rounded-lg px-3 py-2 text-sm preset-tonal-error" role="alert">
          {form.message}
        </p>
      {/if}

      <form
        method="post"
        action="?/changePassword"
        class="mt-4 flex flex-col gap-4"
        use:enhance={() => {
          submitting = true;
          return async ({ update }) => {
            // reset: true clears the three password inputs on success AND on
            // failure. Keeping a rejected password in the box invites the user
            // to resubmit the same wrong value.
            await update();
            submitting = false;
          };
        }}
      >
        <div>
          <label for="currentPassword" class="mb-1.5 block text-sm text-surface-600-400">
            Current password
          </label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autocomplete="current-password"
            aria-invalid={!!form?.fieldErrors?.currentPassword}
            class="w-full rounded-lg border bg-surface-100-900 px-3 py-2 text-sm text-surface-950-50"
            class:border-surface-200-800={!form?.fieldErrors?.currentPassword}
            class:border-error-500={!!form?.fieldErrors?.currentPassword}
          />
          {#if form?.fieldErrors?.currentPassword}
            <p class="mt-1 text-xs text-error-500">{form.fieldErrors.currentPassword}</p>
          {/if}
        </div>

        <div>
          <label for="newPassword" class="mb-1.5 block text-sm text-surface-600-400">
            New password
          </label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            autocomplete="new-password"
            aria-invalid={!!form?.fieldErrors?.newPassword}
            class="w-full rounded-lg border bg-surface-100-900 px-3 py-2 text-sm text-surface-950-50"
            class:border-surface-200-800={!form?.fieldErrors?.newPassword}
            class:border-error-500={!!form?.fieldErrors?.newPassword}
          />
          {#if form?.fieldErrors?.newPassword}
            <p class="mt-1 text-xs text-error-500">{form.fieldErrors.newPassword}</p>
          {:else}
            <p class="mt-1 text-xs text-surface-500">At least 12 characters.</p>
          {/if}
        </div>

        <div>
          <label for="confirmPassword" class="mb-1.5 block text-sm text-surface-600-400">
            Confirm new password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autocomplete="new-password"
            aria-invalid={!!form?.fieldErrors?.confirmPassword}
            class="w-full rounded-lg border bg-surface-100-900 px-3 py-2 text-sm text-surface-950-50"
            class:border-surface-200-800={!form?.fieldErrors?.confirmPassword}
            class:border-error-500={!!form?.fieldErrors?.confirmPassword}
          />
          {#if form?.fieldErrors?.confirmPassword}
            <p class="mt-1 text-xs text-error-500">{form.fieldErrors.confirmPassword}</p>
          {/if}
        </div>

        <div>
          <button
            type="submit"
            disabled={submitting}
            class="rounded-lg px-4 py-2 text-sm font-medium preset-filled-primary-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Changing…' : 'Change password'}
          </button>
        </div>
      </form>
    </section>

    <p class="text-sm text-surface-600-400">
      New to Widgetry? <a href="/faq" class="text-primary-500 hover:underline">Read the FAQ</a>.
    </p>
  {/if}
</div>
