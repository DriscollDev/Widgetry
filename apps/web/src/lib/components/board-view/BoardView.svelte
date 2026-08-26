<script lang="ts">
    import type { BoardViewFixture, BoardViewState } from './fixtures';
  
    export let board: BoardViewFixture; // sole data input — no fetch, no store, no auth
    export let state: BoardViewState = 'populated';
  
    $: refreshLabel =
      board.refreshMode === 'auto'
        ? `Auto · every ${board.refreshIntervalSeconds}s`
        : 'Manual refresh';
  
    // --- Task #166 scope: cursor-follow + snap preview only. No SERVER persistence
    // — that's Task 2's debounced PATCH (Eng Doc §9.3). Local/optimistic position
    // updates on release DO belong here — the drop needs to visually stick before
    // any network call exists, otherwise every drag silently no-ops. ---
    let gridEl: HTMLDivElement;
    let draggingId: string | null = null;
    let previewCol = 0;
    let previewRow = 0;
    let pointerOffsetX = 0;
    let pointerOffsetY = 0;
    let localPositions: Record<string, { col: number; row: number }> = {};
  
    const COLS = 12;
    const ROW_HEIGHT = 80; // px, matches grid-auto-rows minmax(80px, auto)
    const GAP = 8; // px, matches grid gap
  
    function getPos(widget: BoardViewFixture['widgets'][number]) {
      if (draggingId === widget.id) return { col: previewCol, row: previewRow };
      if (localPositions[widget.id]) return localPositions[widget.id];
      return { col: widget.grid_col, row: widget.grid_row };
    }
  
    function startDrag(event: PointerEvent, widget: BoardViewFixture['widgets'][number]) {
      const pos = getPos(widget); // read BEFORE setting draggingId, or getPos short-circuits to stale preview values
      previewCol = pos.col;
      previewRow = pos.row;
      draggingId = widget.id;
  
      const target = event.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      pointerOffsetX = event.clientX - rect.left;
      pointerOffsetY = event.clientY - rect.top;
  
      target.setPointerCapture(event.pointerId);
    }
  
    function onPointerMove(event: PointerEvent) {
      if (draggingId === null || !gridEl) return;
  
      const gridRect = gridEl.getBoundingClientRect();
      const colWidth = (gridRect.width - GAP * (COLS - 1)) / COLS;
  
      const x = event.clientX - gridRect.left - pointerOffsetX;
      const y = event.clientY - gridRect.top - pointerOffsetY;
  
      const col = Math.round(x / (colWidth + GAP));
      const row = Math.round(y / (ROW_HEIGHT + GAP));
  
      previewCol = Math.max(0, Math.min(col, COLS - 1));
      previewRow = Math.max(0, row);
    }
  
    function onPointerUp(_event: PointerEvent) {
      if (draggingId === null) return;
      // Optimistic local update — the widget stays at the dropped cell in the UI.
      // Still zero network calls. Task 2 adds the debounced PATCH + rollback-on-
      // reject on top of this same localPositions state.
      localPositions = { ...localPositions, [draggingId]: { col: previewCol, row: previewRow } };
      draggingId = null;
    }
  
    // Keyboard equivalent for the a11y linter / WCAG 2.1 AA (Feature Spec §6.5).
    // NOTE: this only satisfies "focusable + activatable," it does NOT yet give
    // keyboard users a way to actually reposition a widget — arrow-key movement
    // is a real, separate feature and out of scope for Task #166's cursor-drag
    // scope. Flagging here explicitly rather than letting it quietly not exist:
    // a follow-up story is needed before US-W2 can be called done for keyboard
    // users, not just mouse/touch users.
    function onWidgetKeydown(_event: KeyboardEvent, _widget: BoardViewFixture['widgets'][number]) {
      // Intentionally no-op for now — see note above.
    }
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
          <div class="board-view__skeleton-line"></div>
          <div class="board-view__skeleton-line board-view__skeleton-line--short"></div>
        </div>
      {:else if state === 'error'}
        <div class="board-view__error">
          <svg
            class="board-view__error-icon"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div class="board-view__error-body">
            <p>Something went wrong loading this board.</p>
            <button type="button" on:click={() => console.log('retry board load (stub)')}>
              Retry
            </button>
          </div>
        </div>
      {:else if state === 'empty'}
        <p class="board-view__empty-copy">Your board awaits its first widget.</p>
      {:else}
        <div
          class="board-view__grid"
          bind:this={gridEl}
        >
          {#each board.widgets as widget (widget.id)}
            <div
              class="board-view__widget"
              class:board-view__widget--dragging={draggingId === widget.id}
              style="
                grid-column: {(draggingId === widget.id ? previewCol : (localPositions[widget.id]?.col ?? widget.grid_col)) + 1} / span {widget.grid_width};
                grid-row: {(draggingId === widget.id ? previewRow : (localPositions[widget.id]?.row ?? widget.grid_row)) + 1} / span {widget.grid_height};
              "
              role="button"
              tabindex="0"
              on:pointerdown={(e) => startDrag(e, widget)}
              on:pointermove={onPointerMove}
              on:pointerup={onPointerUp}
              on:keydown={(e) => onWidgetKeydown(e, widget)}
            >
              <!-- widget content renderer is a separate ticket (E4) — placeholder body for now -->
              <span class="board-view__widget-label">{widget.widgetType}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </section>
  
  <style>
    .board-view {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 1.5rem;
      background: light-dark(var(--color-surface-100), var(--color-surface-900));
      border-radius: 0.5rem;
    }
  
    .board-view__name {
      font-size: 1.5rem;
      font-weight: 600;
      color: light-dark(var(--color-surface-900), var(--color-surface-50));
      margin-right: auto;
    }
  
    .board-view__refresh-mode {
      font-family: var(--font-mono, monospace);
      font-size: 0.75rem;
      color: light-dark(var(--color-surface-600), var(--color-surface-300));
    }
  
    .board-view__empty-copy {
      color: light-dark(var(--color-surface-600), var(--color-surface-300));
      font-style: italic;
    }
  
    .board-view__grid {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      grid-auto-rows: minmax(80px, auto);
      gap: 8px;
      touch-action: none;
    }
  
    .board-view__widget {
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 0.375rem;
      background: light-dark(var(--color-surface-50), var(--color-surface-800));
      border: 1px solid light-dark(var(--color-surface-300), var(--color-surface-700));
      cursor: grab;
      user-select: none;
    }
  
    .board-view__widget:focus-visible {
      outline: 2px solid light-dark(var(--color-primary-500), var(--color-primary-400));
      outline-offset: 2px;
    }
  
    .board-view__widget--dragging {
      cursor: grabbing;
      opacity: 0.85;
      border-color: light-dark(var(--color-primary-500), var(--color-primary-400));
      z-index: 10;
    }
  
    .board-view__widget-label {
      font-family: var(--font-mono, monospace);
      font-size: 0.8rem;
      color: light-dark(var(--color-surface-700), var(--color-surface-200));
      pointer-events: none;
    }
  
    .board-view__skeleton-line {
      height: 1rem;
      border-radius: 0.25rem;
      background: light-dark(var(--color-surface-300), var(--color-surface-700));
      animation: board-view-pulse 1.2s ease-in-out infinite;
    }
  
    .board-view__error {
      display: flex;
      gap: 0.5rem;
      color: light-dark(var(--color-error-600), var(--color-error-400));
    }
  
    .board-view__error-icon {
      flex-shrink: 0;
      margin-top: 0.125rem;
    }
  
    .board-view__error-body {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .board-view__actions button {
      font: inherit;
      font-size: 0.875rem;
      color: light-dark(var(--color-primary-600), var(--color-primary-400));
      background: none;
      border: none;
      cursor: pointer;
      padding: 0.25rem 0.5rem;
    }
  
    .board-view__actions button:hover {
      text-decoration: underline;
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