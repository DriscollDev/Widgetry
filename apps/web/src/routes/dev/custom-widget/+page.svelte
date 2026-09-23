<script lang="ts">
  import CustomWidget from '$lib/widgets/custom/CustomWidget.svelte';
  import { CUSTOM_WIDGET_EXAMPLES } from '$lib/widgets/custom/fixtures';
  import { getLayout } from '$lib/widgets/custom/types';
</script>

<div class="grid grid-cols-1 gap-6 p-8 sm:grid-cols-2 xl:grid-cols-3">
  {#each CUSTOM_WIDGET_EXAMPLES as example (example.caption)}
    <!-- layoutId is optional since the US-C4 revision; a fixture without one is
         arranged from its slot count, so there is no named layout to caption. -->
    {@const layout = example.config.layoutId ? getLayout(example.config.layoutId) : null}
    <div class="flex flex-col gap-2">
      <p class="text-xs text-surface-600-400">
        {example.caption}
        <span class="font-mono text-surface-500">
          {#if layout}
            · {layout.name} · min {layout.minWidth}×{layout.minHeight}
          {:else}
            · auto · {example.config.slots.length} slots
          {/if}
        </span>
      </p>
      <CustomWidget config={example.config} slotData={example.slotData} />
    </div>
  {/each}
</div>
