<script lang="ts">
	import BoardView from '$lib/components/board-view/BoardView.svelte';
	import { emptyBoardFixture, populatedBoardFixture } from '$lib/components/board-view/fixtures';
</script>

<div style="display:flex; flex-direction:column; gap:2rem; padding:2rem;">
	<BoardView board={emptyBoardFixture} />
	<BoardView board={populatedBoardFixture} />
</div>