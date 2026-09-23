<!--
  Route: /boards/:id — SCR-APP-02 (Screen Inventory §5.2).

  Deliberately thin: all rendering logic already lives in BoardView.svelte
  (#141). This file hands that component the real data +page.server.ts loaded —
  exactly as the harness at /dev/board-view hands it fixture data — and owns
  the modals: the board header's settings (SCR-MOD-02), which opens the delete
  confirmation (SCR-MOD-03), and the per-widget delete confirmation
  (SCR-MOD-06, US-W4), opened from each widget's menu.
-->
<script lang="ts">
  import { applyAction, deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { startBoardAutoRefresh } from '$lib/board-auto-refresh.js';
  import BoardView from '$lib/components/board-view/BoardView.svelte';
  import BoardSettingsModal from '$lib/modals/BoardSettingsModal.svelte';
  import DeleteBoardModal from '$lib/modals/DeleteBoardModal.svelte';
  import DeleteWidgetModal from '$lib/modals/DeleteWidgetModal.svelte';
  import WidgetCatalogModal from '$lib/modals/WidgetCatalogModal.svelte';
  import WidgetConfigModal from '$lib/modals/WidgetConfigModal.svelte';
  import { findFreeSlot, NEW_WIDGET_HEIGHT, NEW_WIDGET_WIDTH } from '$lib/widget-placement';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let settingsOpen = $state(false);
  let deleteOpen = $state(false);

  // `form` is whichever action ran last; each modal only reads its own shape.
  const settingsResult = $derived(
    form?.fieldErrors ? { message: form.message ?? null, fieldErrors: form.fieldErrors } : null,
  );
  const deleteMessage = $derived(form?.deleteMessage ?? null);

  // --- Task #211 (US-W4): delete one widget. The target is a snapshot taken
  // when the menu's Delete is picked, NOT a lookup into `data`: the moment the
  // delete succeeds the board reloads and the widget vanishes from `data`, and
  // the modal still needs its label while it closes. ---
  let deleteWidgetOpen = $state(false);
  let widgetToDelete = $state<{ id: string; name: string; hasHistory: boolean } | null>(null);

  function requestWidgetDelete(widgetId: string) {
    const meta = data.widgetMeta[widgetId];
    if (!meta) return;
    widgetToDelete = { id: widgetId, ...meta };
    deleteWidgetOpen = true;
  }

  /**
   * The modal's contract (DeleteWidgetModal): resolve when the widget is gone,
   * throw when it is not. The `deleteWidget` action is called the way SvelteKit
   * documents for a custom submit handler - the modal owns its button and needs
   * a promise, which `use:enhance` on a plain <form> cannot give it.
   */
  async function confirmWidgetDelete() {
    const target = widgetToDelete;
    if (!target) throw new Error('No widget is selected for deletion.');

    const body = new FormData();
    body.set('widgetId', target.id);

    const response = await fetch(`/boards/${data.board.id}?/deleteWidget`, {
      method: 'POST',
      headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
      body,
    });
    const result = deserialize(await response.text());

    if (result.type === 'redirect') {
      // Session expired mid-action: let SvelteKit follow the sign-in redirect.
      await applyAction(result);
      return;
    }
    if (result.type !== 'success') throw new Error('The widget could not be deleted.');

    // Reload the board, so the widget disappears and the widget count updates.
    await invalidateAll();
  }
  // --- Task #219 (US-W1): add a widget. The Add widget button opens the catalog
  // (SCR-MOD-04); picking a type opens the config form (SCR-MOD-05), which
  // creates the widget. The board then reloads so the new widget appears. ---
  type PickedWidgetType = {
    id: string;
    displayName: string;
    category: 'monitoring' | 'informational' | 'custom';
    supportsHistory: boolean;
  };

  let catalogOpen = $state(false);
  let configOpen = $state(false);
  let pickedType = $state<PickedWidgetType | null>(null);
  /** Set instead of `pickedType` when opening the config modal to edit an
   * existing widget rather than create one. */
  let editWidgetId = $state<string | null>(null);

  // First free spot for a new widget. Since #204 the API answers 409 to a widget
  // that overlaps another, so a fixed position would fail on any board with a
  // widget in that corner. Derived from the loaded board, so it is current after
  // every reload.
  const nextSlot = $derived.by(() => {
    const slot = findFreeSlot(
      data.board.widgets.map((widget) => ({
        col: widget.grid_col,
        row: widget.grid_row,
        width: widget.grid_width,
        height: widget.grid_height,
      })),
      { width: NEW_WIDGET_WIDTH, height: NEW_WIDGET_HEIGHT },
    );
    return { gridCol: slot.col, gridRow: slot.row };
  });

  function requestAddWidget() {
    catalogOpen = true;
  }

  function onTypePicked(type: PickedWidgetType) {
    pickedType = type;
    editWidgetId = null;
    configOpen = true;
  }

  async function onWidgetCreated() {
    await invalidateAll();
  }

  // Reuses the same WidgetConfigModal instance the create flow uses.
  function requestWidgetEdit(widgetId: string) {
    pickedType = null;
    editWidgetId = widgetId;
    configOpen = true;
  }

  async function onWidgetUpdated() {
    await invalidateAll();
  }

  // --- Task #222 (Eng §12, FR-2.3, FR-4.1): re-query the board on its
  // configured interval in auto mode. `interacting` mirrors BoardView's own
  // drag/resize state so a due tick can skip itself rather than reloading the
  // board mid-gesture. The `$effect` re-runs (stopping the previous scheduler
  // first) whenever refreshMode or refreshIntervalSeconds changes - e.g. the
  // board settings modal saving a new interval - so it is always scheduling
  // against the current settings, never stale ones from the first load. ---
  let interacting = $state(false);

  $effect(() => {
    const stop = startBoardAutoRefresh({
      refreshMode: data.board.refreshMode,
      refreshIntervalSeconds: data.board.refreshIntervalSeconds,
      onRefresh: () => void invalidateAll(),
      isInteracting: () => interacting,
    });
    return stop;
  });
</script>

<svelte:head>
  <title>{data.board.name} · Widgetry</title>
</svelte:head>

<BoardView
  board={data.board}
  state={data.state}
  onOpenSettings={() => (settingsOpen = true)}
  onDeleteWidget={requestWidgetDelete}
  onEditWidget={requestWidgetEdit}
  onAddWidget={requestAddWidget}
  onInteractionChange={(value) => (interacting = value)}
  onRetry={() => invalidateAll()}
/>

<BoardSettingsModal
  open={settingsOpen}
  onOpenChange={(open) => (settingsOpen = open)}
  board={data.board}
  result={settingsResult}
  onDelete={() => {
    settingsOpen = false;
    deleteOpen = true;
  }}
/>

<DeleteBoardModal
  open={deleteOpen}
  onOpenChange={(open) => (deleteOpen = open)}
  board={{ name: data.board.name, widgetCount: data.widgetCount }}
  message={deleteMessage}
/>

<DeleteWidgetModal
  open={deleteWidgetOpen}
  onOpenChange={(open) => (deleteWidgetOpen = open)}
  widget={{ name: widgetToDelete?.name ?? '', hasHistory: widgetToDelete?.hasHistory ?? false }}
  onConfirm={confirmWidgetDelete}
/>

<WidgetCatalogModal
  open={catalogOpen}
  currentWidgetCount={data.widgetCount}
  onOpenChange={(open) => (catalogOpen = open)}
  onSelect={onTypePicked}
/>

<WidgetConfigModal
  open={configOpen}
  boardId={data.board.id}
  widgetType={pickedType}
  {editWidgetId}
  position={nextSlot}
  onOpenChange={(open) => (configOpen = open)}
  onCreated={onWidgetCreated}
  onUpdated={onWidgetUpdated}
/>
