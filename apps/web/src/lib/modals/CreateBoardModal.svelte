<!--
  SCR-MOD-01 - create board (Screen Inventory §5.3). US-B1, US-B5's initial
  setting.

  Posts to the `?/create` action on /boards. The action re-validates against
  CreateBoardRequest and, on success, redirects to the new board; `use:enhance`
  follows that redirect. On failure the modal stays open and shows the action's
  field and form messages.

  Fields are the shared BoardFields (FR-2.2, FR-2.3).
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
    result?: BoardFormResult | null;
  };

  let { open, onOpenChange, result = null }: Props = $props();

  let fields: BoardFields | undefined = $state();
  let name = $state('');
  let refreshMode = $state<BoardRefreshMode>('auto');
  let refreshIntervalSeconds = $state(DEFAULT_REFRESH_INTERVAL_SECONDS);
  let submitting = $state(false);
  /** Server messages are for the submission that produced them only. */
  let showResult = $state(false);

  // Fresh form on every open.
  $effect(() => {
    if (open) {
      name = '';
      refreshMode = 'auto';
      refreshIntervalSeconds = DEFAULT_REFRESH_INTERVAL_SECONDS;
      showResult = false;
      untrack(() => fields?.reset());
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
      action="/boards?/create"
      novalidate
      aria-labelledby="create-board-title"
      use:enhance={({ cancel }) => {
        if (fields && !fields.validateName()) return cancel();
        submitting = true;
        return async ({ update }) => {
          // reset: false keeps the typed values if the action fails.
          await update({ reset: false });
          submitting = false;
          showResult = true;
        };
      }}
    >
      <div class="flex items-center justify-between border-b border-surface-200-800 p-5">
        <h2 id="create-board-title" class="text-lg font-semibold">New board</h2>
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
          idPrefix="create-board"
          bind:name
          bind:refreshMode
          bind:refreshIntervalSeconds
          {serverErrors}
        />
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
          disabled={submitting}
          class="preset-filled-primary-500 rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Creating…' : 'Create board'}
        </button>
      </div>
    </form>
  {/snippet}
</Modal>
