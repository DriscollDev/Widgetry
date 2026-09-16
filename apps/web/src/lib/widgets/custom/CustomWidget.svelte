<script lang="ts">
  // Layouts are deliberately just CSS arrangements - all state handling
  // lives in WidgetSlot, so adding a layout never touches state logic.

  import WidgetSlot from './WidgetSlot.svelte';
  import { getLayout, type CustomWidgetConfig, type SlotData } from './types';

  type Props = {
    config: CustomWidgetConfig;
    /** Positional: slotData[i] belongs to config.slots[i]. */
    slotData: SlotData[];
  };

  let { config, slotData }: Props = $props();

  let layout = $derived(getLayout(config.layoutId));

  function dataFor(index: number): SlotData {
    return slotData[index] ?? { state: 'loading' };
  }
</script>

<div class="flex flex-col gap-3 rounded-xl border border-surface-200-800 bg-surface-50-950 p-4">
  {#if config.title}
    <p class="truncate text-xs text-surface-600-400">{config.title}</p>
  {/if}

  {#if layout.id === 'single'}
    <div class="flex items-center justify-center">
      <WidgetSlot
        config={config.slots[0]}
        data={dataFor(0)}
        accent={config.accent}
        slotClass={layout.slotClasses[0]}
      />
    </div>
  {:else if layout.id === 'split'}
    <div class="grid grid-cols-[auto_1fr] items-center gap-4">
      <WidgetSlot
        config={config.slots[0]}
        data={dataFor(0)}
        accent={config.accent}
        slotClass={layout.slotClasses[0]}
      />
      <WidgetSlot
        config={config.slots[1]}
        data={dataFor(1)}
        accent={config.accent}
        slotClass={layout.slotClasses[1]}
      />
    </div>
  {:else if layout.id === 'hero-strip'}
    <div class="flex flex-col gap-3">
      <div class="flex justify-center">
        <WidgetSlot
          config={config.slots[0]}
          data={dataFor(0)}
          accent={config.accent}
          slotClass={layout.slotClasses[0]}
        />
      </div>
      <div class="grid grid-cols-2 gap-3 border-t border-surface-200-800 pt-3">
        <WidgetSlot
          config={config.slots[1]}
          data={dataFor(1)}
          accent={config.accent}
          slotClass={layout.slotClasses[1]}
        />
        <WidgetSlot
          config={config.slots[2]}
          data={dataFor(2)}
          accent={config.accent}
          slotClass={layout.slotClasses[2]}
        />
      </div>
    </div>
  {:else}
    <div class="flex flex-col gap-3">
      {#each layout.slotClasses as slotClass, i (i)}
        <WidgetSlot config={config.slots[i]} data={dataFor(i)} accent={config.accent} {slotClass} />
      {/each}
    </div>
  {/if}
</div>
