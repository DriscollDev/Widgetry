<script lang="ts">
  // FR-1.7 / EX-16: the non-blocking "verify your email" notice, shown to
  // signed-in users whose `emailVerified` is false.
  //
  // Dismissal is per-session on purpose (Screen Inventory §6.2): the X hides
  // it until the browser closes, and permanent dismissal is deliberately NOT
  // offered. A session cookie gives exactly that, and - unlike sessionStorage
  // - the server can read it, so the notice is present in the SSR output
  // rather than appearing only after hydration.
  //
  // The resend control is a real <form> posting to /resend-verification, so
  // it works before hydration; `use:enhance` upgrades it in place to keep the
  // result inline instead of navigating away.

  import { enhance } from '$app/forms';
  import { dismissCookieValue } from './verify-notice';

  type Props = {
    email: string;
    /** Read from the cookie by the root layout's server load. */
    dismissed?: boolean;
  };

  let { email, dismissed = false }: Props = $props();

  // Two sources, deliberately separate: the cookie the server saw at load,
  // and a dismissal in this tab since. Deriving from both keeps the prop
  // reactive - seeding $state from it would freeze the initial value.
  let dismissedHere = $state(false);
  let visible = $derived(!dismissed && !dismissedHere);

  let submitting = $state(false);
  let sent = $state(false);
  let errorMessage = $state('');

  function dismiss() {
    document.cookie = dismissCookieValue();
    dismissedHere = true;
  }
</script>

{#if visible}
  <div
    role="status"
    class="sticky bottom-0 z-40 border-t border-warning-500/40 bg-surface-100-900"
  >
    <div class="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <!-- Colour + icon + text, never colour alone (Design Principles §3.4). -->
      <svg
        viewBox="0 0 24 24"
        class="size-4 shrink-0 text-warning-500"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path d="M4 6h16v12H4z" stroke-linejoin="round" />
        <path d="m4 7 8 6 8-6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>

      <p class="min-w-0 flex-1 text-sm text-surface-950-50">
        {#if sent}
          Verification email sent to <span class="font-medium">{email}</span>. Check your inbox.
        {:else}
          Verify your email to secure your account.
          <span class="text-surface-600-400">
            We sent a link to <span class="font-medium">{email}</span>.
          </span>
        {/if}
      </p>

      {#if errorMessage}
        <p class="text-sm text-error-500" role="alert">{errorMessage}</p>
      {/if}

      {#if !sent}
        <!-- lowercase `post`: use:enhance compares `form.method` against
             'post', and not every DOM implementation lowercases it for us. -->
        <form
          method="post"
          action="/resend-verification"
          use:enhance={() => {
            submitting = true;
            errorMessage = '';
            return async ({ result }) => {
              submitting = false;
              if (result.type === 'success') {
                sent = true;
              } else if (result.type === 'failure') {
                errorMessage = String(result.data?.message ?? 'Could not send the email.');
              } else {
                errorMessage = 'Could not send the email.';
              }
            };
          }}
        >
          <button
            type="submit"
            disabled={submitting}
            class="rounded-lg border border-surface-200-800 px-3 py-1.5 text-sm font-medium text-surface-950-50 hover:bg-surface-200-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Sending…' : 'Resend email'}
          </button>
        </form>
      {/if}

      <button
        type="button"
        onclick={dismiss}
        aria-label="Dismiss until next session"
        class="rounded-lg p-1.5 text-surface-600-400 hover:bg-surface-200-800"
      >
        <svg
          viewBox="0 0 24 24"
          class="size-4"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  </div>
{/if}
