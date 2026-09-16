<!--
  SCR-MOD-03 - delete board confirmation (Screen Inventory §5.3). US-B4.

  Friction step per the Screen Inventory: the user types the board's exact name
  before the delete button enables, and the cascade is spelled out. The
  `?/delete` action on /boards/:id redirects to /boards on success;
  `use:enhance` follows that redirect.
-->
<script lang="ts">
  import { Modal } from '@skeletonlabs/skeleton-svelte';
  import { enhance } from '$app/forms';

  type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    board: { name: string; widgetCount: number };
    /** From the last failed delete, if any. */
    message?: string | null;
  };

  let { open, onOpenChange, board, message = null }: Props = $props();

  let confirmName = $state('');
  let submitting = $state(false);
  let showMessage = $state(false);

  $effect(() => {
    if (open) {
      confirmName = '';
      showMessage = false;
    }
  });

  const matches = $derived(confirmName === board.name);
  const widgetsLabel = $derived(
    board.widgetCount === 1 ? '1 widget' : `${board.widgetCount} widgets`,
  );
</script>

<Modal
  {open}
  onOpenChange={(state) => onOpenChange(state.open)}
  contentBase="w-full max-w-md rounded-2xl border border-surface-200-800 bg-surface-50-950 shadow-xl"
>
  {#snippet content()}
    <form
      method="POST"
      action="?/delete"
      aria-labelledby="delete-board-title"
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
        <h2 id="delete-board-title" class="text-lg font-semibold text-error-600-400">
          Delete this board?
        </h2>
      </div>

      <div class="space-y-4 p-5">
        {#if showMessage && message}
          <p class="preset-tonal-error rounded-lg px-3 py-2 text-sm" role="alert">{message}</p>
        {/if}

        <p class="text-sm">
          This will permanently delete <strong>{board.name}</strong> and its {widgetsLabel},
          including all history. This can’t be undone.
        </p>

        <div>
          <label for="delete-board-confirm" class="mb-1.5 block text-sm">
            Type <strong>{board.name}</strong> to confirm
          </label>
          <input
            id="delete-board-confirm"
            name="confirmName"
            type="text"
            autocomplete="off"
            spellcheck="false"
            bind:value={confirmName}
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
          {submitting ? 'Deleting…' : 'Delete board'}
        </button>
      </div>
    </form>
  {/snippet}
</Modal>
