<!--
  Route: /boards - SCR-APP-01, board list (Screen Inventory §5).

  Auth is done upstream: the guard in hooks.server.ts redirects an
  unauthenticated visitor to /sign-in?returnTo=/boards. +page.server.ts loads
  the list and handles the SCR-MOD-01 `create` action; this file wires the two
  components together and owns whether the modal is open.

  Still to do (tracked separately):
    - Unverified-email banner (EX-16), which belongs in the app shell.
    - Rename/delete from the list: SCR-MOD-02/03 are opened from the board
      view header per the Screen Inventory, not from here.
-->
<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import BoardList from '$lib/components/board-list/BoardList.svelte';
  import CreateBoardModal from '$lib/modals/CreateBoardModal.svelte';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let createOpen = $state(false);
</script>

<svelte:head>
  <title>Your boards · Widgetry</title>
</svelte:head>

<BoardList
  list={data.list}
  loadError={data.loadError}
  onCreate={() => (createOpen = true)}
  onRetry={() => invalidateAll()}
/>

<CreateBoardModal open={createOpen} onOpenChange={(open) => (createOpen = open)} result={form} />
