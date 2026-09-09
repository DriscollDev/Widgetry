<script lang="ts">
  import { Modal } from '@skeletonlabs/skeleton-svelte';
  import type { ErrorModalContent } from './errors';

  type Props = {
    open: boolean;
    onOpenChange?: (open: boolean) => void;
    error: ErrorModalContent;
    onRetry?: () => void;
  };

  let { open, onOpenChange, error, onRetry }: Props = $props();

  function close() {
    onOpenChange?.(false);
  }
</script>

<Modal
  {open}
  onOpenChange={(state) => onOpenChange?.(state.open)}
  contentBase="w-full max-w-md rounded-2xl border border-surface-200-800 bg-surface-50-950 shadow-xl"
>
  {#snippet content()}
    <div class="flex items-center justify-between border-b border-surface-200-800 p-5">
      <h2 class="text-xl font-semibold text-error-500">{error.title}</h2>
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

    <div class="p-5">
      <div class="preset-tonal-error rounded-lg p-4">
        <div
          class="flex items-center gap-2 text-xs font-semibold tracking-wide text-error-500 uppercase"
        >
          <svg
            viewBox="0 0 24 24"
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" stroke-linecap="round" />
          </svg>
          {error.category}
        </div>
        <p class="mt-2 text-sm">{error.message}</p>
      </div>

      {#if error.details.length > 0}
        <dl class="mt-4 divide-y divide-surface-200-800">
          {#each error.details as detail (detail.label)}
            <div class="flex items-center justify-between py-3 text-sm">
              <dt class="text-surface-600-400">{detail.label}</dt>
              <dd class="font-mono text-error-500">{detail.value}</dd>
            </div>
          {/each}
        </dl>
      {/if}
    </div>

    <div class="flex justify-end border-t border-surface-200-800 p-5">
      <button
        type="button"
        onclick={onRetry}
        class="preset-filled-error-500 rounded-lg px-4 py-2 text-sm font-medium"
      >
        {error.retryLabel}
      </button>
    </div>
  {/snippet}
</Modal>
