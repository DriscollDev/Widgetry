<script lang="ts">
  import CustomWidget from '$lib/widgets/custom/CustomWidget.svelte';
  import { CUSTOM_WIDGET_EXAMPLES } from '$lib/widgets/custom/fixtures';
  import { getLayout } from '$lib/widgets/custom/types';
</script>

<div class="grid grid-cols-1 gap-6 p-8 sm:grid-cols-2 xl:grid-cols-3">
  {#each CUSTOM_WIDGET_EXAMPLES as example (example.caption)}
    {@const layout = getLayout(example.config.layoutId)}
    <div class="flex flex-col gap-2">
      <p class="text-xs text-surface-600-400">
        {example.caption}
        <span class="font-mono text-surface-500">
          · {layout.name} · min {layout.minWidth}×{layout.minHeight}
        </span>
      </p>
      <CustomWidget config={example.config} slotData={example.slotData} />
    </div>
  {/each}
</div>
