<script lang="ts">
    import { Modal } from '@skeletonlabs/skeleton-svelte';
  
    type WidgetTypeSummary = {
      id: string;
      displayName: string;
      category: 'monitoring' | 'informational' | 'custom';
      supportsHistory: boolean;
    };
  
    type Props = {
      open: boolean;
      currentWidgetCount: number;
      onOpenChange?: (open: boolean) => void;
      onSelect?: (widgetType: WidgetTypeSummary) => void;
    };
  
    const MAX_WIDGETS_PER_BOARD = 20;
  
    let { open, currentWidgetCount, onOpenChange, onSelect }: Props = $props();
  
    let status = $state<'loading' | 'populated' | 'error'>('loading');
    let widgetTypes = $state<WidgetTypeSummary[]>([]);
  
    const atLimit = $derived(currentWidgetCount >= MAX_WIDGETS_PER_BOARD);
  
    const categoryOrder = ['monitoring', 'informational', 'custom'] as const;
    const categoryLabel: Record<(typeof categoryOrder)[number], string> = {
      monitoring: 'Monitoring',
      informational: 'Informational',
      custom: 'Custom',
    };
  
    const grouped = $derived(
      categoryOrder
        .map((category) => ({
          category,
          label: categoryLabel[category],
          items: widgetTypes.filter((w) => w.category === category),
        }))
        .filter((group) => group.items.length > 0),
    );
  
    async function loadCatalog() {
      status = 'loading';
      try {
        const res = await fetch('/v1/widgets/catalog');
        if (!res.ok) throw new Error(`Catalog request failed: ${res.status}`);
        const body = await res.json();
        widgetTypes = body.widgetTypes;
        status = 'populated';
      } catch {
        status = 'error';
      }
    }
  
    $effect(() => {
      if (open) loadCatalog();
    });
  
    function pick(widgetType: WidgetTypeSummary) {
      if (atLimit) return;
      onSelect?.(widgetType);
      onOpenChange?.(false);
    }
  
    function close() {
      onOpenChange?.(false);
    }
  </script>
  
  <Modal
    {open}
    onOpenChange={(state) => onOpenChange?.(state.open)}
    contentBase="w-full max-w-lg rounded-2xl border border-surface-200-800 bg-surface-50-950 shadow-xl"
  >
    {#snippet content()}
      <div class="flex items-center justify-between border-b border-surface-200-800 p-5">
        <div>
          <h2 class="text-lg font-semibold text-surface-950-50">Add a widget</h2>
          <p class="text-xs text-surface-600-400">Choose a type to start configuring.</p>
        </div>
        <button
          type="button"
          onclick={close}
          aria-label="Close"
          class="rounded-lg p-1.5 text-surface-600-400 hover:bg-surface-100-900"
        >
          <svg
            viewBox="0 0 24 24"
            class="h-5 w-5"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
  
      <div class="max-h-[60vh] overflow-y-auto p-5">
        {#if atLimit}
          <p class="rounded-lg border border-surface-200-800 bg-surface-100-900 p-4 text-sm text-surface-600-400">
            This board already has {MAX_WIDGETS_PER_BOARD} widgets, the most a board can hold.
            Remove one to add another.
          </p>
        {:else if status === 'loading'}
          <p class="p-4 text-sm text-surface-600-400">Loading widget types…</p>
        {:else if status === 'error'}
          <p class="rounded-lg border border-surface-200-800 bg-surface-100-900 p-4 text-sm text-surface-600-400">
            Couldn't load the widget catalog.
            <button type="button" onclick={loadCatalog} class="text-primary-500 hover:underline">
              Try again
            </button>
          </p>
        {:else}
          <div class="flex flex-col gap-5">
            {#each grouped as group (group.category)}
              <div>
                <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-surface-500">
                  {group.label}
                </h3>
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {#each group.items as item (item.id)}
                    <button
                      type="button"
                      onclick={() => pick(item)}
                      class="flex flex-col items-start gap-1 rounded-lg border border-surface-200-800 bg-surface-100-900 p-3 text-left hover:border-primary-500"
                    >
                      <span class="text-sm font-medium text-surface-950-50">{item.displayName}</span>
                      {#if item.supportsHistory}
                        <span class="text-xs text-surface-600-400">Tracks history</span>
                      {/if}
                    </button>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
  
      <div class="flex items-center justify-end border-t border-surface-200-800 p-5">
        <button
          type="button"
          onclick={close}
          class="rounded-lg border border-surface-200-800 px-4 py-2 text-sm font-medium text-surface-950-50 hover:bg-surface-100-900"
        >
          Cancel
        </button>
      </div>
    {/snippet}
  </Modal>