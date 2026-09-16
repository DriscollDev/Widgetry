<script lang="ts">
  import ErrorModal from '$lib/modals/ErrorModal.svelte';
  import AddWidgetModal from '$lib/modals/AddWidgetModal.svelte';
  import WidgetCatalogModal from '$lib/modals/WidgetCatalogModal.svelte';
  import CustomWidgetModal from '$lib/modals/CustomWidgetModal.svelte';
  import { connectionErrorFixture } from '$lib/modals/fixtures';

  let errorOpen = $state(true);
  let addWidgetOpen = $state(false);
  let catalogOpen = $state(false);
  let customOpen = $state(false);
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
    Widget catalog (real API)
  </button>
  <button
    type="button"
    onclick={() => (customOpen = true)}
    class="preset-filled-primary-500 rounded-lg px-4 py-2 text-sm font-medium"
  >
    Custom widget
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
  onSubmitCustom={(submission) => console.log('custom widget via picker (stub)', submission)}
/>

<CustomWidgetModal
  open={customOpen}
  onOpenChange={(v) => (customOpen = v)}
  onSubmit={(submission) => console.log('custom widget (stub)', submission)}
/>

<WidgetCatalogModal
  open={catalogOpen}
  currentWidgetCount={0}
  onOpenChange={(v) => (catalogOpen = v)}
  onSelect={(widgetType) => console.log('picked widget type (stub)', widgetType)}
/>
