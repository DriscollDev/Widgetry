<script lang="ts">
  import BoardView from '$lib/components/board-view/BoardView.svelte';
  import type { BoardViewState } from '$lib/components/board-view/fixtures';
  import {
    emptyBoardFixture,
    populatedBoardFixture,
    loadingBoardFixture,
    errorBoardFixture,
  } from '$lib/components/board-view/fixtures';

  const states: BoardViewState[] = ['loading', 'empty', 'populated', 'error'];

  function fixtureFor(state: BoardViewState) {
    if (state === 'loading') return loadingBoardFixture;
    if (state === 'error') return errorBoardFixture;
    if (state === 'empty') return emptyBoardFixture;
    return populatedBoardFixture;
  }

  let selectedState: BoardViewState = 'populated';
</script>

<!-- Dev-only isolation harness for BoardView. Not a real route; not shipped. -->
<div style="display:flex; flex-direction:column; gap:1rem; padding:2rem;">
  <div style="display:flex; gap:0.5rem;">
    {#each states as s (s)}
      <button type="button" on:click={() => (selectedState = s)}>
        {s}
      </button>
    {/each}
  </div>

  <BoardView board={fixtureFor(selectedState)} state={selectedState} />
</div>
