<!--
  Route: /boards/:id — SCR-APP-02 (Screen Inventory §5.2).

  Deliberately thin: all rendering logic already lives in BoardView.svelte
  (#141). This file hands that component the real data +page.server.ts loaded —
  exactly as the harness at /dev/board-view hands it fixture data — and owns
  the board header's modals: settings (SCR-MOD-02), which opens the delete
  confirmation (SCR-MOD-03).
-->
<script lang="ts">
  import BoardView from '$lib/components/board-view/BoardView.svelte';
  import BoardSettingsModal from '$lib/modals/BoardSettingsModal.svelte';
  import DeleteBoardModal from '$lib/modals/DeleteBoardModal.svelte';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let settingsOpen = $state(false);
  let deleteOpen = $state(false);

  // `form` is whichever action ran last; each modal only reads its own shape.
  const settingsResult = $derived(
    form?.fieldErrors ? { message: form.message ?? null, fieldErrors: form.fieldErrors } : null,
  );
  const deleteMessage = $derived(form?.deleteMessage ?? null);
</script>

<svelte:head>
  <title>{data.board.name} · Widgetry</title>
</svelte:head>

<BoardView board={data.board} state={data.state} onOpenSettings={() => (settingsOpen = true)} />

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
