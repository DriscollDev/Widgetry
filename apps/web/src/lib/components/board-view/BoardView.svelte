<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { BoardViewFixture, BoardViewState } from './fixtures';

  export let board: BoardViewFixture; // sole data input — no fetch, no store, no auth
  export let state: BoardViewState = 'populated';

  $: refreshLabel =
    board.refreshMode === 'auto'
      ? `Auto · every ${board.refreshIntervalSeconds}s`
      : 'Manual refresh';

  // --- Task #166 scope: cursor-follow + snap preview only. No SERVER persistence
  // — that's Task #170's debounced PATCH (Eng Doc §9.3), directly below. Local/
  // optimistic position updates on release DO belong here — the drop needs to
  // visually stick before any network call exists, otherwise every drag
  // silently no-ops. ---
  let gridEl: HTMLDivElement;
  let previewCol = 0;
  let previewRow = 0;
  let pointerOffsetX = 0;
  let pointerOffsetY = 0;

  // Extended in Task #178 to optionally carry width/height alongside col/row;
  // Task #179 is what actually makes use of those fields for persistence —
  // same object, same commit-on-release pattern as drag already established.
  type WidgetPlacement = { col: number; row: number; width?: number; height?: number };
  // A placement where width/height are always known, never optional. Used
  // wherever a full rectangle is required — overlap checks (#187) and the
  // rollback target both need concrete numbers, never "maybe."
  type FullPlacement = { col: number; row: number; width: number; height: number };
  let localPositions: Record<string, WidgetPlacement> = {};

  const COLS = 12;
  const ROW_HEIGHT = 80; // px, matches grid-auto-rows minmax(80px, auto)
  const GAP = 8; // px, matches grid gap

  // --- Task #178 scope (US-W3): which single mode is active right now, if any.
  // Both drag (#166/#170) and resize (#178) funnel through this one flag so
  // onPointerMove/onPointerUp have exactly one branch point each, rather than
  // two parallel and easily-divergent sets of pointer handlers. ---
  type InteractionMode = 'drag' | 'resize' | null;
  let interactionMode: InteractionMode = null;
  let activeWidgetId: string | null = null;
  let activeHandle: ResizeHandlePosition | null = null;

  // The widget's rect at the MOMENT a resize starts, captured once and never
  // mutated during the drag. Every frame's new rect is computed fresh from
  // this origin + the pointer's current cell, not incrementally from the
  // previous frame — incremental math accumulates rounding drift over a long
  // drag; recomputing from a fixed origin every time doesn't.
  let resizeOrigin = { col: 0, row: 0, width: 1, height: 1 };
  let previewWidth = 1;
  let previewHeight = 1;

  const MIN_SPAN = 1;
  const MAX_SPAN = 6; // FR-3.2

  // --- Task #187 scope (US-W6 / FR-3.3): the widget currently flashing a
  // rejected-overlap conflict, if any. A single id (not a set) is enough —
  // only one widget can be actively dragged/resized at a time, so only one
  // can ever be mid-rejection at once. Cleared automatically after
  // CONFLICT_FLASH_MS; the timer is tracked so a second rapid rejection on
  // the same widget restarts the flash instead of the first timer cutting
  // the second flash short. ---
  let conflictWidgetId: string | null = null;
  let conflictTimer: ReturnType<typeof setTimeout> | null = null;

  /** Kept in sync with the `board-view-conflict-flash` keyframe duration below. */
  const CONFLICT_FLASH_MS = 400;

  function flashConflict(widgetId: string) {
    if (conflictTimer) clearTimeout(conflictTimer);
    conflictWidgetId = widgetId;
    conflictTimer = setTimeout(() => {
      conflictWidgetId = null;
      conflictTimer = null;
    }, CONFLICT_FLASH_MS);
  }

  /** Standard axis-aligned rectangle overlap test — true if the two rectangles
   *  share any area, false if they merely touch at an edge or corner. */
  function rectanglesOverlap(a: FullPlacement, b: FullPlacement): boolean {
    return (
      a.col < b.col + b.width &&
      a.col + a.width > b.col &&
      a.row < b.row + b.height &&
      a.row + a.height > b.row
    );
  }

  /**
   * Would placing `candidateWidgetId` at `candidate` overlap any OTHER widget
   * on the board? Siblings are read at their current RESTING placement
   * (localPositions override, falling back to the widget's server-known
   * rect) — never their preview state, because only the widget actually
   * being dragged/resized ever has a preview; every sibling is at rest for
   * the entire duration of that gesture.
   *
   * This is the client-side half of FR-3.3 (EX-Overlap-Client) — UX-only,
   * no network round trip. It does not replace the server-side check
   * (EX-Overlap-Server, a separate Task): this can be bypassed by a caller
   * that skips the UI, or race with a second tab. The server has the final
   * word; this exists so the common case never needs to ask it.
   */
  function overlapsAnySibling(
    candidateWidgetId: string,
    candidate: FullPlacement,
    widgets: BoardViewFixture['widgets'],
    positions: typeof localPositions,
  ): boolean {
    return widgets.some((widget) => {
      if (widget.id === candidateWidgetId) return false;
      const local = positions[widget.id];
      const rect: FullPlacement = {
        col: local?.col ?? widget.grid_col,
        row: local?.row ?? widget.grid_row,
        width: local?.width ?? widget.grid_width,
        height: local?.height ?? widget.grid_height,
      };
      return rectanglesOverlap(candidate, rect);
    });
  }

  // --- Task #170 scope: persist a drag to the server. FR-3.4's 500ms budget is
  // debounce (300ms, Eng §9.3) + the PATCH round trip, so the debounce alone
  // eats the majority of that budget — a slow network hop is the only way to
  // blow it, which is a backend/infra concern, not something to compensate for
  // here by shrinking the debounce below spec.
  //
  // --- Task #179 scope: this pipeline is now shared between drag and resize.
  // patchWidgetPlacement/rollbackPosition/schedulePlacementPatch all operate
  // on the full WidgetPlacement shape (col/row/width/height) rather than
  // col/row alone — a drag only ever changes col/row and a resize only ever
  // changes col/row/width/height together (per #178's anchor math, resizing
  // can shift col/row too, e.g. dragging the `nw` handle), but there's no
  // reason to maintain two near-identical PATCH pipelines when one generic
  // one covers both call sites. ---

  /** One pending timer per widget id, so dragging/resizing widget A mid-debounce
   *  on widget B cannot cancel B's pending save — each widget's persistence is
   *  independent of every other widget's. */
  const pendingPatchTimers: Record<string, ReturnType<typeof setTimeout>> = {};

  const DEBOUNCE_MS = 300;

  /**
   * PATCH the widget's placement. Body only includes the fields that actually
   * changed for this interaction — a drag never sends gridWidth/gridHeight,
   * a resize always sends all four — matching UpdateWidgetRequest's
   * `.partial()` shape (packages/shared/src/api/widgets.ts) rather than
   * always sending a fully-populated body regardless of what happened.
   */
  async function patchWidgetPlacement(
    widgetId: string,
    placement: { gridCol: number; gridRow: number; gridWidth?: number; gridHeight?: number },
    previousPosition: WidgetPlacement,
  ): Promise<void> {
    let response: Response;
    try {
      response = await fetch(`/v1/widgets/${widgetId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(placement),
      });
    } catch {
      // Network failure (offline, DNS, etc.) — same rollback as a rejected
      // response below. The optimistic UI must not claim a position/size the
      // server never actually recorded.
      rollbackPosition(widgetId, previousPosition);
      return;
    }

    if (!response.ok) {
      // Covers both a validation failure (this widget's own placement is
      // somehow invalid) and an FR-3.3 overlap rejection FROM THE SERVER —
      // the backstop half (EX-Overlap-Server), distinct from the client-side
      // check above. Either way the server did not accept the drop/resize,
      // so the optimistic local state is now a lie and has to be corrected.
      rollbackPosition(widgetId, previousPosition);
    }
    // On success, localPositions already holds the value the server just
    // confirmed (set optimistically in onPointerUp) — nothing further to do.
  }

  function rollbackPosition(widgetId: string, previousPosition: WidgetPlacement) {
    localPositions = { ...localPositions, [widgetId]: previousPosition };
  }

  /**
   * `includeSpan` is passed explicitly by the caller (true for resize, false
   * for drag) rather than inferred from whether nextPosition.width is
   * defined. It's ALWAYS defined in practice — currentPlacement() falls back
   * to the widget's own grid_width/grid_height whenever there's no local
   * override, so even a widget's first-ever drag carries a defined width.
   * Inferring intent from that would silently send gridWidth/gridHeight on
   * every plain drag, growing #170's PATCH body for no reason and risking an
   * unintended width/height overwrite on every move. The caller already
   * knows which interaction this is — asking it to say so directly is more
   * reliable than reverse-engineering it from the data shape.
   */
  function schedulePlacementPatch(
    widgetId: string,
    nextPosition: WidgetPlacement,
    previousPosition: WidgetPlacement,
    includeSpan: boolean,
  ) {
    clearTimeout(pendingPatchTimers[widgetId]);

    pendingPatchTimers[widgetId] = setTimeout(() => {
      delete pendingPatchTimers[widgetId];

      const placement: {
        gridCol: number;
        gridRow: number;
        gridWidth?: number;
        gridHeight?: number;
      } = {
        gridCol: nextPosition.col,
        gridRow: nextPosition.row,
      };
      // Only include width/height when this interaction actually set them —
      // keeps a plain drag's PATCH body identical to what #170 always sent,
      // rather than growing every drag's payload just because the type now
      // technically allows width/height to be present. Deliberately checking
      // the explicit `includeSpan` flag here, NOT `nextPosition.width !==
      // undefined` — that check is always true in practice (currentPlacement
      // always fills in width/height), which was the exact bug fixed once
      // already; regressing to it would silently start sending width/height
      // on every plain drag again.
      if (includeSpan) {
        placement.gridWidth = nextPosition.width;
        placement.gridHeight = nextPosition.height;
      }

      void patchWidgetPlacement(widgetId, placement, previousPosition);
    }, DEBOUNCE_MS);
  }

  // Leaving the board mid-debounce (nav away, harness state switch) should not
  // fire a PATCH into a view nobody is looking at anymore. Does not attempt to
  // flush pending saves synchronously on unmount — that is a real UX tradeoff
  // (a very-last-moment drag/resize could be lost) but forcing a
  // beforeunload-style flush is out of scope for #170/#179's stated ACs.
  onDestroy(() => {
    for (const timer of Object.values(pendingPatchTimers)) clearTimeout(timer);
    if (conflictTimer) clearTimeout(conflictTimer);
  });

  // --- FIX (Svelte reactivity gotcha): getPos/getSpan used to read
  // previewCol, previewRow, interactionMode, activeWidgetId, and
  // localPositions directly off the component's own scope. That's invisible
  // to Svelte's compiler when the call is embedded in a template {@const} —
  // the compiler only tracks identifiers it can see literally inside the
  // template expression, not identifiers read inside a called function's
  // body. Passing every reactive value in as an explicit argument puts those
  // identifiers directly in the template expression, so Svelte correctly
  // reruns {@const pos}/{@const span} (and therefore the grid-column/
  // grid-row style binding) whenever any of them change during a drag or
  // resize. ---
  function getPos(
    widget: BoardViewFixture['widgets'][number],
    mode: InteractionMode,
    activeId: string | null,
    pCol: number,
    pRow: number,
    positions: typeof localPositions,
  ) {
    if (mode === 'drag' && activeId === widget.id) {
      return { col: pCol, row: pRow };
    }
    if (positions[widget.id]) return positions[widget.id];
    return { col: widget.grid_col, row: widget.grid_row };
  }

  /**
   * Same idea as `getPos` but for width/height. A widget being actively
   * resized reads its live preview span; otherwise it reads whatever was
   * last locally committed, falling back to the widget's server-known span.
   */
  function getSpan(
    widget: BoardViewFixture['widgets'][number],
    mode: InteractionMode,
    activeId: string | null,
    pWidth: number,
    pHeight: number,
    positions: typeof localPositions,
  ) {
    if (mode === 'resize' && activeId === widget.id) {
      return { width: pWidth, height: pHeight };
    }
    const local = positions[widget.id];
    if (local?.width !== undefined && local?.height !== undefined) {
      return { width: local.width, height: local.height };
    }
    return { width: widget.grid_width, height: widget.grid_height };
  }

  /**
   * The full known placement for a widget right now — used as the "previous
   * position" rollback target for BOTH drag and resize, and as each
   * sibling's resting rectangle in the #187 overlap check. Falls back
   * through localPositions to the widget's server-known values, so this
   * always returns concrete numbers, never a partial guess.
   */
  function currentPlacement(widget: BoardViewFixture['widgets'][number]): FullPlacement {
    const local = localPositions[widget.id];
    return {
      col: local?.col ?? widget.grid_col,
      row: local?.row ?? widget.grid_row,
      width: local?.width ?? widget.grid_width,
      height: local?.height ?? widget.grid_height,
    };
  }

  function startDrag(event: PointerEvent, widget: BoardViewFixture['widgets'][number]) {
    const pos = getPos(
      widget,
      interactionMode,
      activeWidgetId,
      previewCol,
      previewRow,
      localPositions,
    ); // read BEFORE setting activeWidgetId, or getPos short-circuits to stale preview values
    previewCol = pos.col;
    previewRow = pos.row;
    interactionMode = 'drag';
    activeWidgetId = widget.id;

    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    pointerOffsetX = event.clientX - rect.left;
    pointerOffsetY = event.clientY - rect.top;

    target.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent) {
    if (interactionMode === null || !gridEl) return;
    if (interactionMode === 'drag') {
      onDragPointerMove(event);
    } else {
      onResizePointerMove(event);
    }
  }

  function onDragPointerMove(event: PointerEvent) {
    const gridRect = gridEl.getBoundingClientRect();
    const colWidth = (gridRect.width - GAP * (COLS - 1)) / COLS;

    const x = event.clientX - gridRect.left - pointerOffsetX;
    const y = event.clientY - gridRect.top - pointerOffsetY;

    const col = Math.round(x / (colWidth + GAP));
    const row = Math.round(y / (ROW_HEIGHT + GAP));

    previewCol = Math.max(0, Math.min(col, COLS - 1));
    previewRow = Math.max(0, row);
  }

  function onPointerUp(_event: PointerEvent, widget: BoardViewFixture['widgets'][number]) {
    if (interactionMode === 'drag') {
      onDragPointerUp(widget);
    } else if (interactionMode === 'resize') {
      onResizePointerUp(widget);
    }
  }

  function onDragPointerUp(widget: BoardViewFixture['widgets'][number]) {
    const previousPosition = currentPlacement(widget);
    const candidate: FullPlacement = {
      col: previewCol,
      row: previewRow,
      width: previousPosition.width,
      height: previousPosition.height,
    };

    // Clear interaction state regardless of outcome — a rejected drop is
    // still a finished gesture, not a stuck one.
    interactionMode = null;
    activeWidgetId = null;

    // --- Task #187 (FR-3.3): reject-and-snap-back. Skipping the
    // localPositions write below is what MAKES this a snap-back — getPos
    // falls through to the widget's last-known-good rest position the
    // instant interactionMode clears, since nothing here ever told it
    // otherwise. There is no separate "undo" step because nothing was ever
    // committed to undo. ---
    if (overlapsAnySibling(widget.id, candidate, board.widgets, localPositions)) {
      flashConflict(widget.id);
      return;
    }

    const nextPosition: WidgetPlacement = { ...previousPosition, col: previewCol, row: previewRow };

    // Optimistic local update — the widget stays at the dropped cell in the
    // UI immediately, before the network round trip even starts.
    localPositions = { ...localPositions, [widget.id]: nextPosition };

    schedulePlacementPatch(widget.id, nextPosition, previousPosition, false);
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

  // --- Task #177 established the handles themselves; Task #178 is the actual
  // anchor math + clamping. Kept in the same file/section since the two Tasks
  // share the RESIZE_HANDLES table and the ResizeHandlePosition type. ---
  type ResizeHandlePosition = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

  const RESIZE_HANDLES: { position: ResizeHandlePosition; cursor: string }[] = [
    { position: 'n', cursor: 'ns-resize' },
    { position: 'ne', cursor: 'nesw-resize' },
    { position: 'e', cursor: 'ew-resize' },
    { position: 'se', cursor: 'nwse-resize' },
    { position: 's', cursor: 'ns-resize' },
    { position: 'sw', cursor: 'nesw-resize' },
    { position: 'w', cursor: 'ew-resize' },
    { position: 'nw', cursor: 'nwse-resize' },
  ];

  /**
   * For each axis (col/row), does this handle keep the START edge fixed and
   * grow the END edge ('fixed-start'), keep the END edge fixed and move the
   * START edge ('fixed-end'), or leave that axis untouched entirely ('none').
   * Encoding this as a table means the math below is written once and reused
   * for all 8 handles, instead of 8 near-duplicate branches that drift apart
   * over time.
   */
  const HANDLE_AXES: Record<
    ResizeHandlePosition,
    { col: 'fixed-start' | 'fixed-end' | 'none'; row: 'fixed-start' | 'fixed-end' | 'none' }
  > = {
    n: { col: 'none', row: 'fixed-end' },
    ne: { col: 'fixed-start', row: 'fixed-end' },
    e: { col: 'fixed-start', row: 'none' },
    se: { col: 'fixed-start', row: 'fixed-start' },
    s: { col: 'none', row: 'fixed-start' },
    sw: { col: 'fixed-end', row: 'fixed-start' },
    w: { col: 'fixed-end', row: 'none' },
    nw: { col: 'fixed-end', row: 'fixed-end' },
  };

  function onResizeHandlePointerDown(
    event: PointerEvent,
    position: ResizeHandlePosition,
    widget: BoardViewFixture['widgets'][number],
  ) {
    // Stops the parent widget's own pointerdown (startDrag) from also firing
    // on the same bubbled event — a resize must never simultaneously start a
    // whole-widget drag.
    event.stopPropagation();

    const pos = getPos(
      widget,
      interactionMode,
      activeWidgetId,
      previewCol,
      previewRow,
      localPositions,
    );
    const span = getSpan(
      widget,
      interactionMode,
      activeWidgetId,
      previewWidth,
      previewHeight,
      localPositions,
    );
    resizeOrigin = { col: pos.col, row: pos.row, width: span.width, height: span.height };
    previewCol = pos.col;
    previewRow = pos.row;
    previewWidth = span.width;
    previewHeight = span.height;

    interactionMode = 'resize';
    activeWidgetId = widget.id;
    activeHandle = position;

    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
  }

  function clampSpan(value: number, maxAllowed: number): number {
    return Math.max(MIN_SPAN, Math.min(value, MAX_SPAN, maxAllowed));
  }

  function onResizePointerMove(event: PointerEvent) {
    if (activeHandle === null) return;

    const gridRect = gridEl.getBoundingClientRect();
    const colWidth = (gridRect.width - GAP * (COLS - 1)) / COLS;

    // The pointer's current cell — no drag-grab offset here, unlike drag:
    // there's no "where within the widget did you grab it," the handle IS
    // the edge being positioned.
    const pointerCol = Math.round((event.clientX - gridRect.left) / (colWidth + GAP));
    const pointerRow = Math.round((event.clientY - gridRect.top) / (ROW_HEIGHT + GAP));

    const axes = HANDLE_AXES[activeHandle];

    // --- Column axis ---
    if (axes.col === 'fixed-start') {
      const roomToRightEdge = COLS - resizeOrigin.col;
      previewWidth = clampSpan(pointerCol - resizeOrigin.col + 1, roomToRightEdge);
      previewCol = resizeOrigin.col;
    } else if (axes.col === 'fixed-end') {
      const anchorCol = resizeOrigin.col + resizeOrigin.width - 1;
      previewWidth = clampSpan(anchorCol - pointerCol + 1, anchorCol + 1);
      previewCol = anchorCol - previewWidth + 1;
    }
    // 'none': col/width for this handle are untouched.

    // --- Row axis --- (mirrors column axis; rows have no upper grid bound
    // per FR-3.1 "rows grow as needed," so no room-to-edge cap here, only
    // MIN_SPAN/MAX_SPAN and the non-negative floor.)
    if (axes.row === 'fixed-start') {
      previewHeight = clampSpan(pointerRow - resizeOrigin.row + 1, Infinity);
      previewRow = resizeOrigin.row;
    } else if (axes.row === 'fixed-end') {
      const anchorRow = resizeOrigin.row + resizeOrigin.height - 1;
      previewHeight = clampSpan(anchorRow - pointerRow + 1, anchorRow + 1);
      previewRow = anchorRow - previewHeight + 1;
    }
  }

  function onResizePointerUp(widget: BoardViewFixture['widgets'][number]) {
    const previousPosition = currentPlacement(widget);
    const candidate: FullPlacement = {
      col: previewCol,
      row: previewRow,
      width: previewWidth,
      height: previewHeight,
    };

    interactionMode = null;
    activeWidgetId = null;
    activeHandle = null;

    // --- Task #187 (FR-3.3): same reject-and-snap-back reasoning as drag,
    // above — a resize that would overlap a sibling never gets committed, so
    // getSpan/getPos fall back to the widget's last-known-good size the
    // moment interactionMode clears. ---
    if (overlapsAnySibling(widget.id, candidate, board.widgets, localPositions)) {
      flashConflict(widget.id);
      return;
    }

    const nextPosition: WidgetPlacement = {
      col: previewCol,
      row: previewRow,
      width: previewWidth,
      height: previewHeight,
    };

    localPositions = { ...localPositions, [widget.id]: nextPosition };

    schedulePlacementPatch(widget.id, nextPosition, previousPosition, true);
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
      <div class="board-view__grid" bind:this={gridEl}>
        {#each board.widgets as widget (widget.id)}
          {@const pos = getPos(
            widget,
            interactionMode,
            activeWidgetId,
            previewCol,
            previewRow,
            localPositions,
          )}
          {@const span = getSpan(
            widget,
            interactionMode,
            activeWidgetId,
            previewWidth,
            previewHeight,
            localPositions,
          )}
          <div
            class="board-view__widget"
            class:board-view__widget--dragging={interactionMode === 'drag' &&
              activeWidgetId === widget.id}
            class:board-view__widget--resizing={interactionMode === 'resize' &&
              activeWidgetId === widget.id}
            class:board-view__widget--conflict={conflictWidgetId === widget.id}
            style="
                grid-column: {pos.col + 1} / span {span.width};
                grid-row: {pos.row + 1} / span {span.height};
              "
            role="button"
            tabindex="0"
            on:pointerdown={(e) => startDrag(e, widget)}
            on:pointermove={onPointerMove}
            on:pointerup={(e) => onPointerUp(e, widget)}
            on:keydown={(e) => onWidgetKeydown(e, widget)}
          >
            <!-- widget content renderer is a separate ticket (E4) — placeholder body for now -->
            <span class="board-view__widget-label">{widget.widgetType}</span>

            <!-- Task #177/#178: pointermove and pointerup are NOT attached
                 here on the handle itself. setPointerCapture (in
                 onResizeHandlePointerDown) redirects where move/up events
                 TARGET, but they still bubble from the handle up through this
                 parent div same as any DOM event — so the parent's existing
                 on:pointermove/on:pointerup above are sufficient and already
                 branch on `interactionMode` to route to the resize handlers.
                 Duplicating listeners on each of the 8 handles would just be
                 redundant. -->
            {#each RESIZE_HANDLES as handle (handle.position)}
              <span
                class="board-view__resize-handle board-view__resize-handle--{handle.position}"
                style="cursor: {handle.cursor};"
                role="button"
                tabindex="-1"
                aria-label="Resize {handle.position}"
                on:pointerdown={(e) => onResizeHandlePointerDown(e, handle.position, widget)}
                data-resize-handle={handle.position}
              ></span>
            {/each}
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
    position: relative; /* anchors the absolutely-positioned resize handles */
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

  /* No cursor override here, unlike --dragging — the active resize handle's
     own cursor is what should show during a resize, not a whole-widget
     grabbing cursor. */
  .board-view__widget--resizing {
    opacity: 0.85;
    border-color: light-dark(var(--color-primary-500), var(--color-primary-400));
    z-index: 10;
  }

  /* --- Task #187 (FR-3.3): the rejected-overlap flash. A border-color pulse
     using the same error token every other error state in the app uses
     (matches .board-view__error below), not a bespoke red — consistent
     status-color vocabulary rather than a one-off. Duration must match
     CONFLICT_FLASH_MS in the script block; the JS timer, not the CSS
     animation, is what actually clears the class, so a mismatch here would
     just make the flash look slightly off, not break functionally. */
  .board-view__widget--conflict {
    animation: board-view-conflict-flash 400ms ease;
  }

  @keyframes board-view-conflict-flash {
    0%,
    100% {
      border-color: light-dark(var(--color-surface-300), var(--color-surface-700));
    }
    50% {
      border-color: light-dark(var(--color-error-600), var(--color-error-400));
    }
  }

  .board-view__widget-label {
    font-family: var(--font-mono, monospace);
    font-size: 0.8rem;
    color: light-dark(var(--color-surface-700), var(--color-surface-200));
    pointer-events: none;
  }

  /* --- Task #177: resize handles ---
     Hidden by default; shown on hover OR keyboard focus (`:focus-within`
     covers the widget itself since it's the tabindex="0" element, not a
     handle). Corner handles are small squares that straddle the border;
     edge handles are thin strips centered on their side. */
  .board-view__resize-handle {
    position: absolute;
    z-index: 5;
    opacity: 0;
    background: light-dark(var(--color-primary-500), var(--color-primary-400));
    border-radius: 2px;
    transition: opacity 120ms ease;
  }

  .board-view__widget:hover .board-view__resize-handle,
  .board-view__widget:focus-within .board-view__resize-handle {
    opacity: 1;
  }

  /* Corners: 10px squares, centered on the exact corner point. */
  .board-view__resize-handle--nw,
  .board-view__resize-handle--ne,
  .board-view__resize-handle--se,
  .board-view__resize-handle--sw {
    width: 10px;
    height: 10px;
  }

  .board-view__resize-handle--nw {
    top: -5px;
    left: -5px;
  }
  .board-view__resize-handle--ne {
    top: -5px;
    right: -5px;
  }
  .board-view__resize-handle--se {
    bottom: -5px;
    right: -5px;
  }
  .board-view__resize-handle--sw {
    bottom: -5px;
    left: -5px;
  }

  /* Edges: thin strips centered along the middle third of their side, so
     they don't collide with the corner handles at each end. */
  .board-view__resize-handle--n,
  .board-view__resize-handle--s {
    left: 33%;
    width: 34%;
    height: 6px;
  }
  .board-view__resize-handle--n {
    top: -3px;
  }
  .board-view__resize-handle--s {
    bottom: -3px;
  }

  .board-view__resize-handle--e,
  .board-view__resize-handle--w {
    top: 33%;
    height: 34%;
    width: 6px;
  }
  .board-view__resize-handle--e {
    right: -3px;
  }
  .board-view__resize-handle--w {
    left: -3px;
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
