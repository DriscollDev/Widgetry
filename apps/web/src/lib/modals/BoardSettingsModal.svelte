<!--
  SCR-MOD-02 - board settings (Screen Inventory §5.3). US-B3 rename, US-B5
  refresh mode, and the entry to US-B4's delete confirmation.

  Posts to the `?/update` action on /boards/:id, which re-validates against
  UpdateBoardRequest. The whole form is always sent, so the refresh pair moves
  together as the contract requires. On success the page data reloads (the
  header shows the new name) and the modal closes; on failure it stays open
  with the action's messages.
-->
<script lang="ts">
  import { Modal } from '@skeletonlabs/skeleton-svelte';
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import type { BoardRefreshMode } from '@widgetry/shared';
  import { DEFAULT_REFRESH_INTERVAL_SECONDS, type BoardFormResult } from '$lib/board-forms';
  import BoardFields from './BoardFields.svelte';

  type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    board: {
      name: string;
      refreshMode: BoardRefreshMode;
      refreshIntervalSeconds: number | null;
    };
    /** Opens SCR-MOD-03. The page swaps this modal for that one. */
    onDelete: () => void;
    result?: BoardFormResult | null;
  };

  let { open, onOpenChange, board, onDelete, result = null }: Props = $props();

  let fields: BoardFields | undefined = $state();
  let name = $state('');
  let refreshMode = $state<BoardRefreshMode>('auto');
  let refreshIntervalSeconds = $state(DEFAULT_REFRESH_INTERVAL_SECONDS);
  let submitting = $state(false);
  /** Server messages are for the submission that produced them only. */
  let showResult = $state(false);

  // Start from the board's saved settings on every open. `board` is untracked
  // so the reload after a save does not overwrite a form still being edited.
  $effect(() => {
    if (open) {
      untrack(() => {
        name = board.name;
        refreshMode = board.refreshMode;
        refreshIntervalSeconds = board.refreshIntervalSeconds ?? DEFAULT_REFRESH_INTERVAL_SECONDS;
        showResult = false;
        fields?.reset();
      });
    }
  });

  const serverErrors = $derived(showResult ? result?.fieldErrors : null);
  const formMessage = $derived(showResult ? result?.message : null);
</script>

<Modal
  {open}
  onOpenChange={(state) => onOpenChange(state.open)}
  contentBase="w-full max-w-md rounded-2xl border border-surface-200-800 bg-surface-50-950 shadow-xl"
>
  {#snippet content()}
    <form
      method="POST"
      action="?/update"
      novalidate
      aria-labelledby="board-settings-title"
      use:enhance={({ cancel }) => {
        if (fields && !fields.validateName()) return cancel();
        submitting = true;
        return async ({ result: actionResult, update }) => {
          await update({ reset: false });
          submitting = false;
          if (actionResult.type === 'success') {
            onOpenChange(false);
          } else {
            showResult = true;
          }
        };
      }}
    >
      <div class="flex items-center justify-between border-b border-surface-200-800 p-5">
        <h2 id="board-settings-title" class="text-lg font-semibold">Board settings</h2>
        <button
          type="button"
          onclick={() => onOpenChange(false)}
          aria-label="Close"
          class="rounded-lg p-1.5 text-surface-600-400 hover:bg-surface-100-900"
        >
          <svg
            viewBox="0 0 24 24"
            class="h-5 w-5"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div class="space-y-5 p-5">
        {#if formMessage}
          <p class="preset-tonal-error rounded-lg px-3 py-2 text-sm" role="alert">{formMessage}</p>
        {/if}

        <BoardFields
          bind:this={fields}
          idPrefix="board-settings"
          bind:name
          bind:refreshMode
          bind:refreshIntervalSeconds
          {serverErrors}
        />
      </div>

      <div class="flex items-center justify-between gap-2 border-t border-surface-200-800 p-5">
        <button
          type="button"
          onclick={onDelete}
          class="preset-tonal-error rounded-lg px-4 py-2 text-sm font-medium"
        >
          Delete board
        </button>
        <div class="flex gap-2">
          <button
            type="button"
            onclick={() => onOpenChange(false)}
            class="preset-tonal rounded-lg px-4 py-2 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            class="preset-filled-primary-500 rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </form>
  {/snippet}
</Modal>
