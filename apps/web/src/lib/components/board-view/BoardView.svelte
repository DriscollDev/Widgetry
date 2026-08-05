<script lang="ts">
	import type { BoardViewFixture } from './fixtures';

	export let board: BoardViewFixture;

	$: isEmpty = board.widgets.length === 0;
	$: refreshLabel =
		board.refreshMode === 'auto'
			? `Auto · every ${board.refreshIntervalSeconds}s`
			: 'Manual refresh';
</script>

<section class="board-view" data-board-id={board.id}>
	<header class="board-view__header">
		<h1 class="board-view__name">{board.name}</h1>
		<span class="board-view__refresh-mode">{refreshLabel}</span>

		<div class="board-view__actions">
			<!-- Stubbed for Task 1/Story #141 — real modals wire up separately -->
			<button type="button" on:click={() => console.log('open board settings (stub)')}>
				Settings
			</button>
			<button type="button" on:click={() => console.log('open widget catalog (stub)')}>
				Add widget
			</button>
		</div>
	</header>

	<div class="board-view__body">
		{#if isEmpty}
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
</style>