<script lang="ts">
  // Standalone entry to the custom flow, used by the /dev gallery so the
  // three steps can be exercised without clicking through the template
  // picker first. The real app reaches this flow via AddWidgetModal's
  // "Custom" card; both render the same CustomWidgetForm.

  import { Modal } from '@skeletonlabs/skeleton-svelte';
  import CustomWidgetForm from './CustomWidgetForm.svelte';
  import type { CustomWidgetSubmission } from '../widgets/custom/types';

  type Props = {
    open: boolean;
    onOpenChange?: (open: boolean) => void;
    onSubmit?: (submission: CustomWidgetSubmission) => void;
  };

  let { open, onOpenChange, onSubmit }: Props = $props();

  // Remounts the form on each open so a cancelled draft doesn't persist.
  let instance = $state(0);

  function close() {
    onOpenChange?.(false);
  }
</script>

<Modal
  {open}
  onOpenChange={(state) => {
    onOpenChange?.(state.open);
    if (!state.open) instance += 1;
  }}
  contentBase="w-full max-w-3xl rounded-2xl border border-surface-200-800 bg-surface-50-950 shadow-xl"
>
  {#snippet content()}
    {#key instance}
      <CustomWidgetForm onClose={close} {onSubmit} />
    {/key}
  {/snippet}
</Modal>
