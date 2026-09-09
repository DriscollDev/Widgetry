<script lang="ts">
  import ErrorModal from '$lib/modals/ErrorModal.svelte';
  import AddWidgetModal from '$lib/modals/AddWidgetModal.svelte';
  import { connectionErrorFixture } from '$lib/modals/fixtures';

  let errorOpen = $state(true);
  let addWidgetOpen = $state(false);
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
