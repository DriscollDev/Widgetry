<script lang="ts">
  import ErrorModal from '$lib/modals/ErrorModal.svelte';
  import AddWidgetModal from '$lib/modals/AddWidgetModal.svelte';
  import WidgetCatalogModal from '$lib/modals/WidgetCatalogModal.svelte';
  import WidgetConfigModal from '$lib/modals/WidgetConfigModal.svelte';
  import { connectionErrorFixture } from '$lib/modals/fixtures';

  const TEST_BOARD_ID = 'a1c31b3d-ff13-4d15-a2f0-d4200afef406';

  let errorOpen = $state(true);
  let addWidgetOpen = $state(false);
  let catalogOpen = $state(false);
  let configOpen = $state(false);
  let selectedType = $state<{
    id: string;
    displayName: string;
    category: 'monitoring' | 'informational' | 'custom';
    supportsHistory: boolean;
  } | null>(null);
</script>

<div class="flex min-h-screen items-center justify-center gap-3 p-8">
  <button
    type="button"
    onclick={() => (errorOpen = true)}
    class="preset-filled-primary-500 rounded-lg px-4 py-2 text-sm font-medium"
  >
    Show error modal
  </button>
  <button
    type="button"
    onclick={() => (addWidgetOpen = true)}
    class="preset-filled-primary-500 rounded-lg px-4 py-2 text-sm font-medium"
  >
    Add widget
  </button>
  <button
    type="button"
    onclick={() => (catalogOpen = true)}
    class="preset-filled-primary-500 rounded-lg px-4 py-2 text-sm font-medium"
  >
    Widget catalog → config (full flow)
  </button>
</div>

<ErrorModal
  open={errorOpen}
  onOpenChange={(v) => (errorOpen = v)}
  error={connectionErrorFixture}
  onRetry={() => console.log('retry clicked (stub)')}
/>

<AddWidgetModal
  open={addWidgetOpen}
  onOpenChange={(v) => (addWidgetOpen = v)}
  onSubmit={(submission) => console.log('add widget (stub)', submission)}
/>

<WidgetCatalogModal
  open={catalogOpen}
  currentWidgetCount={0}
  onOpenChange={(v) => (catalogOpen = v)}
  onSelect={(widgetType) => {
    selectedType = widgetType;
    configOpen = true;
  }}
/>

<WidgetConfigModal
  open={configOpen}
  boardId={TEST_BOARD_ID}
  widgetType={selectedType}
  onOpenChange={(v) => (configOpen = v)}
  onCreated={(widget) => console.log('widget created!', widget)}
/>
