<!--
  SCR-MOD-01 - create board (Screen Inventory §5.3). US-B1, US-B5's initial
  setting.

  Posts to the `?/create` action on /boards. The action re-validates against
  CreateBoardRequest and, on success, redirects to the new board; `use:enhance`
  follows that redirect. On failure the modal stays open and shows the action's
  field and form messages.

  Fields (FR-2.2, FR-2.3): name 1-64 characters, whitespace-only rejected;
  refresh mode; interval, shown only for auto. Duplicate names are allowed.
-->
<script lang="ts">
  import { Modal } from '@skeletonlabs/skeleton-svelte';
  import { enhance } from '$app/forms';
  import { BOARD_NAME_MAX_LENGTH, BoardName, type BoardRefreshMode } from '@widgetry/shared';
  import {
    DEFAULT_REFRESH_INTERVAL_SECONDS,
    REFRESH_INTERVAL_OPTIONS,
    type CreateBoardFormResult,
  } from '$lib/board-forms';
  import { fieldError } from '$lib/auth-forms';

  type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    result?: CreateBoardFormResult | null;
  };

  let { open, onOpenChange, result = null }: Props = $props();

  let name = $state('');
  let refreshMode = $state<BoardRefreshMode>('auto');
  let refreshIntervalSeconds = $state(DEFAULT_REFRESH_INTERVAL_SECONDS);
  let nameError = $state('');
  let submitting = $state(false);
  /** Server messages are for the submission that produced them only. */
  let showResult = $state(false);

  // Fresh form on every open.
  $effect(() => {
    if (open) {
      name = '';
      refreshMode = 'auto';
      refreshIntervalSeconds = DEFAULT_REFRESH_INTERVAL_SECONDS;
      nameError = '';
      showResult = false;
    }
  });

  const serverErrors = $derived(showResult ? result?.fieldErrors : undefined);
  const formMessage = $derived(showResult ? result?.message : null);
  const shownNameError = $derived(nameError || serverErrors?.name || '');

  function validateName() {
    nameError = fieldError(BoardName, name);
    return !nameError;
  }
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
        if (!validateName()) return cancel();
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

        <div>
          <label for="board-name" class="mb-1.5 block text-sm font-medium">Name</label>
          <input
            id="board-name"
            name="name"
            type="text"
            maxlength={BOARD_NAME_MAX_LENGTH}
            autocomplete="off"
            placeholder="Production APIs"
            bind:value={name}
            onblur={() => name && validateName()}
            aria-invalid={!!shownNameError}
            aria-describedby={shownNameError ? 'board-name-error' : undefined}
            class="input w-full"
          />
          {#if shownNameError}
            <p id="board-name-error" class="mt-1 text-xs text-error-600-400">{shownNameError}</p>
          {/if}
        </div>

        <fieldset>
          <legend class="mb-1.5 text-sm font-medium">Refresh</legend>
          <div class="flex gap-4">
            <label class="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="refreshMode"
                value="auto"
                bind:group={refreshMode}
                class="radio"
              />
              Automatic
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="refreshMode"
                value="manual"
                bind:group={refreshMode}
                class="radio"
              />
              Manual
            </label>
          </div>
          {#if serverErrors?.refreshMode}
            <p class="mt-1 text-xs text-error-600-400">{serverErrors.refreshMode}</p>
          {/if}
        </fieldset>

        {#if refreshMode === 'auto'}
          <div>
            <label for="board-interval" class="mb-1.5 block text-sm font-medium">
              Refresh every
            </label>
            <select
              id="board-interval"
              name="refreshIntervalSeconds"
              bind:value={refreshIntervalSeconds}
              class="select w-full"
            >
              {#each REFRESH_INTERVAL_OPTIONS as option (option.value)}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
            {#if serverErrors?.refreshIntervalSeconds}
              <p class="mt-1 text-xs text-error-600-400">{serverErrors.refreshIntervalSeconds}</p>
            {/if}
          </div>
        {:else}
          <p class="text-xs text-surface-600-400">
            The board updates only when you refresh it yourself.
          </p>
        {/if}
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
