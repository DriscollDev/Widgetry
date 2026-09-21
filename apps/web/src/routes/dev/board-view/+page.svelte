<script lang="ts">
  import BoardView from '$lib/components/board-view/BoardView.svelte';
  import type { BoardViewState } from '$lib/components/board-view/fixtures';
  import {
    emptyBoardFixture,
    populatedBoardFixture,
    loadingBoardFixture,
    errorBoardFixture,
    snapshotStatesBoardFixture,
  } from '$lib/components/board-view/fixtures';

  const states: BoardViewState[] = ['loading', 'empty', 'populated', 'error'];

  function fixtureFor(state: BoardViewState) {
    if (state === 'loading') return loadingBoardFixture;
    if (state === 'error') return errorBoardFixture;
    if (state === 'empty') return emptyBoardFixture;
    return populatedBoardFixture;
  }

  let selectedState: BoardViewState = 'populated';
  // Task #236: a populated board whose widgets carry a value snapshot, an error
  // snapshot and none, so the payload reaching the renderers can be seen.
  let showSnapshotStates = false;
  // Task #214: stub for the widget menu's Delete item. The real route wires
  // the confirm modal + DELETE call (Task #211); here we only prove the
  // callback fires with the right widget id.
  let lastDeleteRequest: string | null = null;
</script>

<!-- Dev-only isolation harness for BoardView. Not a real route; not shipped. -->
<div style="display:flex; flex-direction:column; gap:1rem; padding:2rem;">
  <div style="display:flex; gap:0.5rem;">
    {#each states as s (s)}
      <button
        type="button"
        on:click={() => {
          selectedState = s;
          showSnapshotStates = false;
        }}
      >
        {s}
      </button>
    {/each}
    <button type="button" on:click={() => (showSnapshotStates = true)}>snapshot states</button>
  </div>

  <BoardView
    board={showSnapshotStates ? snapshotStatesBoardFixture : fixtureFor(selectedState)}
    state={showSnapshotStates ? 'populated' : selectedState}
    onAddWidget={() => console.log('add widget requested (stub)')}
    onDeleteWidget={(widgetId) => {
      lastDeleteRequest = widgetId;
      console.log('delete widget requested (stub)', widgetId);
    }}
  />

  {#if lastDeleteRequest}
    <p>Delete requested for {lastDeleteRequest}</p>
  {/if}
</div>
