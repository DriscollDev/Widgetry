<!--
  SCR-APP-01 - board list (Screen Inventory §5.2). US-B2, and the entry point to
  US-B1's create modal.

  Presentational: the route loads the data and owns the modal. States covered:
  empty, populated, at-limit (FR-2.1 - "New board" disabled with its reason
  shown), error-loading. There is no client-side loading state because the list
  arrives with the page from the server load.
-->
<script lang="ts">
  import type { BoardListResponse } from '@widgetry/shared';
  import { formatRefresh } from '$lib/board-forms';

  type Props = {
    list: BoardListResponse | null;
    loadError: string | null;
    onCreate: () => void;
    onRetry: () => void;
  };

  let { list, loadError, onCreate, onRetry }: Props = $props();

  const limitReason = $derived(
    list
      ? `You have ${list.boards.length} of ${list.maxBoards} boards. Delete one to create another.`
      : '',
  );
</script>

<section class="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
  <header class="flex flex-wrap items-center justify-between gap-4">
    <div>
      <h1 class="text-2xl font-semibold">Your boards</h1>
      {#if list && list.boards.length > 0}
        <p class="mt-1 text-sm text-surface-600-400">
          {list.boards.length} of {list.maxBoards} boards
        </p>
      {/if}
    </div>

    {#if list && list.boards.length > 0}
      <!-- Disabled buttons fire no pointer events, so the tooltip sits on a wrapper (§6.4). -->
      <span title={list.atLimit ? limitReason : undefined}>
        <button
          type="button"
          onclick={onCreate}
          disabled={list.atLimit}
          aria-describedby={list.atLimit ? 'board-limit-reason' : undefined}
          class="preset-filled-primary-500 rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          New board
        </button>
      </span>
    {/if}
  </header>

  {#if list?.atLimit}
    <p id="board-limit-reason" class="mt-3 text-sm text-surface-600-400">{limitReason}</p>
  {/if}

  {#if loadError || !list}
    <div class="preset-tonal-error mt-8 rounded-xl p-6" role="alert">
      <p class="text-sm">{loadError ?? 'We couldn’t load your boards.'}</p>
      <button
        type="button"
        onclick={onRetry}
        class="preset-filled-error-500 mt-4 rounded-lg px-4 py-2 text-sm font-medium"
      >
        Retry
      </button>
    </div>
  {:else if list.boards.length === 0}
    <div
      class="mt-8 flex flex-col items-center rounded-xl border border-dashed border-surface-300-700 px-6 py-16 text-center"
    >
      <h2 class="text-lg font-medium">No boards yet - a blank canvas.</h2>
      <p class="mt-2 max-w-sm text-sm text-surface-600-400">
        A board is a grid of widgets watching the APIs you care about. Start one and give it a name.
      </p>
      <button
        type="button"
        onclick={onCreate}
        class="preset-filled-primary-500 mt-6 rounded-lg px-4 py-2 text-sm font-medium"
      >
        Create your first board
      </button>
    </div>
  {:else}
    <ul class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each list.boards as board (board.id)}
        <li>
          <a
            href="/boards/{board.id}"
            class="block h-full rounded-xl border border-surface-200-800 bg-surface-50-950 p-5 transition-colors hover:border-primary-500 focus-visible:outline-2 focus-visible:outline-primary-500"
          >
            <h2 class="truncate font-medium">{board.name}</h2>
            <p class="mt-2 text-sm text-surface-600-400">
              {board.widgetCount}
              {board.widgetCount === 1 ? 'widget' : 'widgets'}
            </p>
            <p class="mt-1 text-xs text-surface-600-400">{formatRefresh(board)}</p>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</section>
