<!--
  Route: /boards/:id — SCR-APP-02 (Screen Inventory §5.2).

  Deliberately thin: all rendering logic already lives in BoardView.svelte
  (#141). This file's only job is handing that component the real data
  +page.server.ts loaded — exactly as the harness at /dev/board-view hands it
  fixture data, same component, different data source, per #141's own
  "prop-source change, not a rewrite" design intent.
-->
<script lang="ts">
  import BoardView from '$lib/components/board-view/BoardView.svelte';
  import type { PageData } from './$types';

  export let data: PageData;
</script>

<BoardView board={data.board} state={data.state} />
