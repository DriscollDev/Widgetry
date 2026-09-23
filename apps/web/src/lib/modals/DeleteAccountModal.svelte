<!--
  SCR-MOD-08 - delete account confirmation (Screen Inventory §5.3). US-A5 /
  FR-1.6.

  Friction step: the user types their own email address before the button
  enables. That mirrors DeleteBoardModal's typed-name gate, with one important
  difference - here the typed value is not decoration. The api requires
  `confirmEmail` on DELETE /v1/me and compares it against the session's own
  address, so this field IS the request, and a caller skipping the UI still has
  to produce it.

  The cascade is spelled out rather than summarised. FR-1.6 deletes boards,
  widgets, snapshots and stored credentials with the account, and someone
  agreeing to that should be told what "everything" covers.
-->
<script lang="ts">
  import { Modal } from '@skeletonlabs/skeleton-svelte';
  import { enhance } from '$app/forms';

  type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The signed-in user's address - what must be typed to confirm. */
    email: string;
    /** From the last failed attempt, if any. */
    message?: string | null;
  };

  let { open, onOpenChange, email, message = null }: Props = $props();

  let confirmEmail = $state('');
  let submitting = $state(false);
  let showMessage = $state(false);

  $effect(() => {
    if (open) {
      confirmEmail = '';
      showMessage = false;
    }
  });

  // Case-insensitive and trimmed, matching what the api actually compares -
  // a modal stricter than the endpoint would reject a correct answer.
  const matches = $derived(confirmEmail.trim().toLowerCase() === email.trim().toLowerCase());
</script>

<Modal
  {open}
  onOpenChange={(state) => onOpenChange(state.open)}
  contentBase="w-full max-w-md rounded-2xl border border-surface-200-800 bg-surface-50-950 shadow-xl"
>
  {#snippet content()}
    <form
      method="POST"
      action="?/deleteAccount"
      aria-labelledby="delete-account-title"
      use:enhance={({ cancel }) => {
        if (!matches) return cancel();
        submitting = true;
        return async ({ update }) => {
          await update({ reset: false });
          submitting = false;
          showMessage = true;
        };
      }}
    >
      <div class="border-b border-surface-200-800 p-5">
        <h2 id="delete-account-title" class="text-lg font-semibold text-error-600-400">
          Delete your account?
        </h2>
      </div>

      <div class="space-y-4 p-5">
        {#if showMessage && message}
          <p class="preset-tonal-error rounded-lg px-3 py-2 text-sm" role="alert">{message}</p>
        {/if}

        <p class="text-sm">
          This permanently deletes your account and everything in it: every board, every widget, all
          collected history, and any saved API keys. This can’t be undone.
        </p>

        <p class="text-sm text-surface-600-400">
          Signing up again with the same address gives you a new, empty account — not this one.
        </p>

        <div>
          <label for="delete-account-confirm" class="mb-1.5 block text-sm">
            Type <strong>{email}</strong> to confirm
          </label>
          <input
            id="delete-account-confirm"
            name="confirmEmail"
            type="text"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            bind:value={confirmEmail}
            class="input w-full"
          />
        </div>
      </div>

      <div class="flex justify-end gap-2 border-t border-surface-200-800 p-5">
        <button
          type="button"
          onclick={() => onOpenChange(false)}
          class="preset-tonal rounded-lg px-4 py-2 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!matches || submitting}
          class="preset-filled-error-500 rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Deleting…' : 'Delete my account'}
        </button>
      </div>
    </form>
  {/snippet}
</Modal>
