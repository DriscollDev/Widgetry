<!--
  SCR-MOD-06 - delete widget confirmation (Screen Inventory §5.3). US-W4.

  Lighter friction than SCR-MOD-03: one confirm click, no typed name, because a
  widget is cheaper to recreate than a board. The cascade is still spelled out.

  Contract for the caller: `onConfirm` resolves when the widget is gone and
  rejects when it is not. On resolve the modal closes itself through
  `onOpenChange(false)`; on reject it stays open with an inline error so the
  user can retry. While `onConfirm` is pending, Cancel, Esc and the confirm
  button are all inert.
-->
<script lang="ts">
  import { Modal } from '@skeletonlabs/skeleton-svelte';

  type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    widget: { name: string; hasHistory: boolean };
    onConfirm: () => void | Promise<void>;
  };

  let { open, onOpenChange, widget, onConfirm }: Props = $props();

  let submitting = $state(false);
  let errorMessage = $state<string | null>(null);

  $effect(() => {
    if (open) {
      submitting = false;
      errorMessage = null;
    }
  });

  async function confirm() {
    if (submitting) return;
    submitting = true;
    errorMessage = null;
    let succeeded = false;
    try {
      await onConfirm();
      succeeded = true;
    } catch {
      errorMessage = 'Couldn’t delete this widget. Try again.';
    } finally {
      submitting = false;
    }
    if (succeeded) onOpenChange(false);
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    void confirm();
  }
</script>

<Modal
  {open}
  onOpenChange={(state) => {
    if (submitting && !state.open) return;
    onOpenChange(state.open);
  }}
  contentBase="w-full max-w-md rounded-2xl border border-surface-200-800 bg-surface-50-950 shadow-xl"
>
  {#snippet content()}
    <form aria-labelledby="delete-widget-title" onsubmit={handleSubmit}>
      <div class="border-b border-surface-200-800 p-5">
        <h2 id="delete-widget-title" class="text-lg font-semibold text-error-600-400">
          Delete this widget?
        </h2>
      </div>

      <div class="space-y-4 p-5">
        {#if errorMessage}
          <p class="preset-tonal-error rounded-lg px-3 py-2 text-sm" role="alert">{errorMessage}</p>
        {/if}

        <p class="text-sm">
          This will permanently delete <strong>{widget.name}</strong>{widget.hasHistory
            ? ' and its history'
            : ''}. This can’t be undone.
        </p>
      </div>

      <div class="flex justify-end gap-2 border-t border-surface-200-800 p-5">
        <button
          type="button"
          disabled={submitting}
          onclick={() => onOpenChange(false)}
          class="preset-tonal rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          class="preset-filled-error-500 rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Deleting…' : 'Delete widget'}
        </button>
      </div>
    </form>
  {/snippet}
</Modal>
