<script lang="ts">
  import { Modal } from '@skeletonlabs/skeleton-svelte';
  import ConfigForm from './ConfigForm.svelte';
  import { WIDGET_TYPE_DEFS } from '@widgetry/shared';
  import type { WidgetType } from '@widgetry/shared';
  import { NEW_WIDGET_HEIGHT, NEW_WIDGET_WIDTH } from '$lib/widget-placement';
  import { configFieldErrors } from './api-field-errors';

  type WidgetTypeSummary = {
    id: string;
    displayName: string;
    category: 'monitoring' | 'informational' | 'custom';
    supportsHistory: boolean;
  };

  type Props = {
    open: boolean;
    boardId: string;
    widgetType: WidgetTypeSummary | null;
    onOpenChange?: (open: boolean) => void;
    onCreated?: (widget: unknown) => void;
    /**
     * Where the new widget goes. The API rejects a widget that overlaps another
     * (FR-3.3), so the board page passes the first free slot. Defaults to the
     * top-left corner for callers with no board to look at (the dev gallery).
     */
    position?: { gridCol: number; gridRow: number };
  };

  let {
    open,
    boardId,
    widgetType,
    onOpenChange,
    onCreated,
    position = { gridCol: 0, gridRow: 0 },
  }: Props = $props();

  let values = $state<Record<string, string>>({});
  let errors = $state<Record<string, string>>({});
  let status = $state<'idle' | 'submitting' | 'error'>('idle');

  const def = $derived(widgetType ? WIDGET_TYPE_DEFS[widgetType.id as WidgetType] : null);

  $effect(() => {
    // Reset form state whenever a new type is selected.
    if (widgetType) {
      values = {};
      errors = {};
      status = 'idle';
    }
  });

  function close() {
    onOpenChange?.(false);
  }

  async function submit() {
    if (!widgetType || !def) return;
    status = 'submitting';
    errors = {};

    // Coerce string form values into the shape the API's config schema
    // expects (numbers/booleans back to real types) before sending.
    const config: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(values)) {
      config[key] = raw;
    }

    try {
      const res = await fetch(`/v1/boards/${boardId}/widgets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          widgetType: widgetType.id,
          config,
          gridCol: position.gridCol,
          gridRow: position.gridRow,
          gridWidth: NEW_WIDGET_WIDTH,
          gridHeight: NEW_WIDGET_HEIGHT,
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        if (body.error?.code === 'validation_failed') {
          // The API sends details.issues as [{ path: 'config.url', message }].
          // This used to read details.fieldErrors, which the API never sends, so
          // every field error fell through to the generic message.
          errors = configFieldErrors(body);
        }
        status = 'error';
        return;
      }

      onCreated?.(body);
      close();
    } catch {
      status = 'error';
    }
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
        <h2 class="text-lg font-semibold text-surface-950-50">
          Configure {widgetType?.displayName}
        </h2>
        <p class="text-xs text-surface-600-400">Point it at an endpoint and save.</p>
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
      {#if def}
        <ConfigForm schema={def.configSchema} bind:values {errors} />
      {/if}
      {#if status === 'error' && Object.keys(errors).length === 0}
        <p class="mt-3 text-sm text-error-500">Something went wrong saving this widget.</p>
      {/if}
    </div>

    <div class="flex items-center justify-end gap-2 border-t border-surface-200-800 p-5">
      <button
        type="button"
        onclick={close}
        class="rounded-lg border border-surface-200-800 px-4 py-2 text-sm font-medium text-surface-950-50 hover:bg-surface-100-900"
      >
        Cancel
      </button>
      <button
        type="button"
        onclick={submit}
        disabled={status === 'submitting'}
        class="preset-filled-primary-500 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {status === 'submitting' ? 'Saving…' : 'Add widget'}
      </button>
    </div>
  {/snippet}
</Modal>
