<script lang="ts">
  import type { BoardViewFixture, BoardViewState } from './fixtures';

  export let board: BoardViewFixture; // sole data input — no fetch, no store, no auth
  export let state: BoardViewState = 'populated';

  $: refreshLabel =
    board.refreshMode === 'auto'
      ? `Auto · every ${board.refreshIntervalSeconds}s`
      : 'Manual refresh';
</script>

<section class="board-view" data-board-id={board.id} data-state={state}>
  <header class="board-view__header">
    <h1 class="board-view__name">{board.name}</h1>
    <span class="board-view__refresh-mode">{refreshLabel}</span>

    <div class="board-view__actions">
      <button type="button" on:click={() => console.log('open board settings (stub)')}>
        Settings
      </button>
      <button type="button" on:click={() => console.log('open widget catalog (stub)')}>
        Add widget
      </button>
    </div>
  </header>

  <div class="board-view__body">
    {#if state === 'loading'}
      <div class="board-view__skeleton" aria-busy="true" aria-label="Loading board">
        <div class="board-view__skeleton-line" />
        <div class="board-view__skeleton-line board-view__skeleton-line--short" />
      </div>
    {:else if state === 'error'}
      <div class="board-view__error">
        <p>Something went wrong loading this board.</p>
        <button type="button" on:click={() => console.log('retry board load (stub)')}>
          Retry
        </button>
      </div>
    {:else if state === 'empty'}
      <p class="board-view__empty-copy">Your board awaits its first widget.</p>
    {:else}
      <!-- Placeholder only — real grid renderer is F3.3/E4, not this ticket -->
      <p class="board-view__widget-count">{board.widgets.length} widgets</p>
    {/if}
  </div>
</section>

<style>
  .board-view {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.5rem;
    background: var(--color-surface-100);
    border-radius: 0.5rem;
  }

  .board-view__header {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .board-view__name {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--color-surface-900);
    margin-right: auto;
  }

  .board-view__refresh-mode {
    font-family: var(--font-mono, monospace);
    font-size: 0.75rem;
    color: var(--color-surface-600);
  }

  .board-view__actions {
    display: flex;
    gap: 0.5rem;
  }

  .board-view__empty-copy {
    color: var(--color-surface-600);
    font-style: italic;
  }

  .board-view__widget-count {
    font-family: var(--font-mono, monospace);
    color: var(--color-surface-700);
  }

  .board-view__skeleton {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .board-view__skeleton-line {
    height: 1rem;
    border-radius: 0.25rem;
    background: var(--color-surface-300);
    animation: board-view-pulse 1.2s ease-in-out infinite;
  }

  .board-view__skeleton-line--short {
    width: 40%;
  }

  @keyframes board-view-pulse {
    0%,
    100% {
      opacity: 0.5;
    }
    50% {
      opacity: 1;
    }
  }

  .board-view__error {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    color: var(--color-error-600, #b91c1c);
  }
</style>
