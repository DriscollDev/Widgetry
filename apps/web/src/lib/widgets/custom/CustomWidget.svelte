<script lang="ts">
  // Layouts are deliberately just CSS arrangements - all state handling
  // lives in WidgetSlot, so adding a layout never touches state logic.
  //
  // TWO WAYS A WIDGET GETS ARRANGED, since the US-C4 revision:
  //
  //   config.layoutId present  one of the four named layouts, pinned. Every
  //                            config written before slots became free-form
  //                            takes this path, so they render exactly as
  //                            they always did.
  //   absent                   arranged from the slot count. One slot is the
  //                            feature; two sit side by side; three or more
  //                            become a grid, which is the only thing that
  //                            stays legible in a tile at six.
  //
  // The named layouts are kept rather than folded into the automatic path
  // because hero-strip's "one big value over two small ones" is a real
  // arrangement the automatic rule does not produce, and existing widgets use
  // it.

  import { arrangementFor, type SlotClass } from '@widgetry/shared';
  import WidgetSlot from './WidgetSlot.svelte';
  import { getLayout, type CustomWidgetConfig, type SlotData } from './types';

  type Props = {
    config: CustomWidgetConfig;
    /** Positional: slotData[i] belongs to config.slots[i]. */
    slotData: SlotData[];
  };

  let { config, slotData }: Props = $props();

  const pinned = $derived(config.layoutId ? getLayout(config.layoutId) : null);
  const slots = $derived(config.slots ?? []);

  /** Sizing hints, from the pinned layout or from how many slots there are. */
  const slotClasses = $derived<readonly SlotClass[]>(
    pinned ? pinned.slotClasses : arrangementFor(slots.length),
  );

  /** Columns for the automatic grid. Three across is the widest that stays readable. */
  const gridCols = $derived(slots.length >= 5 ? 'grid-cols-3' : 'grid-cols-2');

  function dataFor(index: number): SlotData {
    return slotData[index] ?? { state: 'loading' };
  }

  function classFor(index: number): SlotClass {
    return slotClasses[index] ?? 'compact';
  }
</script>

<div class="flex flex-col gap-3 rounded-xl border border-surface-200-800 bg-surface-50-950 p-4">
  {#if config.title}
    <p class="truncate text-xs text-surface-600-400">{config.title}</p>
  {/if}

  {#if pinned?.id === 'single'}
    <div class="flex items-center justify-center">
      <WidgetSlot
        config={config.slots[0]}
        data={dataFor(0)}
        accent={config.accent}
        slotClass={classFor(0)}
      />
    </div>
  {:else if pinned?.id === 'split'}
    <div class="grid grid-cols-[auto_1fr] items-center gap-4">
      <WidgetSlot
        config={config.slots[0]}
        data={dataFor(0)}
        accent={config.accent}
        slotClass={classFor(0)}
      />
      <WidgetSlot
        config={config.slots[1]}
        data={dataFor(1)}
        accent={config.accent}
        slotClass={classFor(1)}
      />
    </div>
  {:else if pinned?.id === 'hero-strip'}
    <div class="flex flex-col gap-3">
      <div class="flex justify-center">
        <WidgetSlot
          config={config.slots[0]}
          data={dataFor(0)}
          accent={config.accent}
          slotClass={classFor(0)}
        />
      </div>
      <div class="grid grid-cols-2 gap-3 border-t border-surface-200-800 pt-3">
        <WidgetSlot
          config={config.slots[1]}
          data={dataFor(1)}
          accent={config.accent}
          slotClass={classFor(1)}
        />
        <WidgetSlot
          config={config.slots[2]}
          data={dataFor(2)}
          accent={config.accent}
          slotClass={classFor(2)}
        />
      </div>
    </div>
  {:else if pinned?.id === 'trio'}
    <div class="flex flex-col gap-3">
      {#each pinned.slotClasses as slotClass, i (i)}
        <WidgetSlot config={config.slots[i]} data={dataFor(i)} accent={config.accent} {slotClass} />
      {/each}
    </div>
  {:else if slots.length === 1}
    <!-- Automatic, from here down. One value gets the whole tile. -->
    <div class="flex items-center justify-center">
      <WidgetSlot
        config={slots[0]}
        data={dataFor(0)}
        accent={config.accent}
        slotClass={classFor(0)}
      />
    </div>
  {:else if slots.length === 2}
    <div class="grid grid-cols-[auto_1fr] items-center gap-4">
      {#each slots as slot, i (i)}
        <WidgetSlot
          config={slot}
          data={dataFor(i)}
          accent={config.accent}
          slotClass={classFor(i)}
        />
      {/each}
    </div>
  {:else}
    <div class="grid {gridCols} gap-3">
      {#each slots as slot, i (i)}
        <WidgetSlot
          config={slot}
          data={dataFor(i)}
          accent={config.accent}
          slotClass={classFor(i)}
        />
      {/each}
    </div>
  {/if}
</div>
