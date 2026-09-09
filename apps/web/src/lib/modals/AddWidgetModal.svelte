<script lang="ts">
  import { Modal } from '@skeletonlabs/skeleton-svelte';
  import { WIDGET_TEMPLATES, type WidgetTemplate } from './widget-templates';
  import { buildWidgetSubmission, type BuiltWidgetSubmission } from './build-widget-submission';

  type Props = {
    open: boolean;
    onOpenChange?: (open: boolean) => void;
    onSubmit?: (submission: BuiltWidgetSubmission) => void;
  };

  let { open, onOpenChange, onSubmit }: Props = $props();

  let step = $state<'pick' | 'configure'>('pick');
  let selected = $state<WidgetTemplate | null>(null);
  let values = $state<Record<string, string>>({});

  function pick(template: WidgetTemplate) {
    selected = template;
    values = Object.fromEntries(template.fields.map((f) => [f.key, f.defaultValue ?? '']));
    step = 'configure';
  }

  function back() {
    step = 'pick';
    selected = null;
  }

  function reset() {
    step = 'pick';
    selected = null;
    values = {};
  }

  function close() {
    onOpenChange?.(false);
  }

  function submit() {
    if (!selected) return;
    onSubmit?.(buildWidgetSubmission(selected, values));
    close();
  }
</script>

<Modal
  {open}
  onOpenChange={(state) => {
    onOpenChange?.(state.open);
    if (!state.open) reset();
  }}
  contentBase="w-full max-w-lg rounded-2xl border border-surface-200-800 bg-surface-50-950 shadow-xl"
>
  {#snippet content()}
    <div class="flex items-center justify-between border-b border-surface-200-800 p-5">
      <div>
        <h2 class="text-lg font-semibold text-surface-950-50">
          {step === 'pick' ? 'Add a widget' : `Configure ${selected?.name}`}
        </h2>
        <p class="text-xs text-surface-600-400">
          {step === 'pick'
            ? 'Choose a template to start from.'
            : 'Point it at an endpoint and label what it shows.'}
        </p>
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
      {#if step === 'pick'}
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {#each WIDGET_TEMPLATES as template (template.id)}
            <button
              type="button"
              onclick={() => pick(template)}
              class="flex flex-col items-start gap-1 rounded-lg border border-surface-200-800 bg-surface-100-900 p-3 text-left hover:border-primary-500"
            >
              <span class="text-sm font-medium text-surface-950-50">{template.name}</span>
              <span class="text-xs text-surface-600-400">{template.description}</span>
            </button>
          {/each}
        </div>
      {:else if selected}
        <div class="flex flex-col gap-4">
          {#each selected.fields as field (field.key)}
            <div>
              <label for={field.key} class="mb-1.5 block text-xs text-surface-600-400">
                {field.label}
              </label>
              {#if field.type === 'select'}
                <select
                  id={field.key}
                  bind:value={values[field.key]}
                  class="w-full rounded-lg border border-surface-200-800 bg-surface-100-900 px-3 py-2 text-sm text-surface-950-50"
                >
                  {#each field.options ?? [] as option (option.value)}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              {:else if field.type === 'color'}
                <div class="flex gap-2" role="radiogroup" aria-label={field.label}>
                  {#each field.options ?? [] as option (option.value)}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={values[field.key] === option.value}
                      aria-label={option.label}
                      title={option.label}
                      onclick={() => (values[field.key] = option.value)}
                      style="background-color: var(--color-{option.value}-500);"
                      class="h-7 w-7 rounded-full border-2"
                      class:border-surface-950-50={values[field.key] === option.value}
                      class:border-transparent={values[field.key] !== option.value}
                    ></button>
                  {/each}
                </div>
              {:else}
                <input
                  id={field.key}
                  type={field.type}
                  placeholder={field.placeholder}
                  bind:value={values[field.key]}
                  class="w-full rounded-lg border border-surface-200-800 bg-surface-100-900 px-3 py-2 text-sm text-surface-950-50 placeholder-surface-500"
                />
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="flex items-center justify-between border-t border-surface-200-800 p-5">
      {#if step === 'configure'}
        <button
          type="button"
          onclick={back}
          class="text-sm text-surface-600-400 hover:text-surface-950-50"
        >
          &larr; Back
        </button>
      {:else}
        <span></span>
      {/if}
      <div class="flex gap-2">
        <button
          type="button"
          onclick={close}
          class="rounded-lg border border-surface-200-800 px-4 py-2 text-sm font-medium text-surface-950-50 hover:bg-surface-100-900"
        >
          Cancel
        </button>
        {#if step === 'configure'}
          <button
            type="button"
            onclick={submit}
            class="preset-filled-primary-500 rounded-lg px-4 py-2 text-sm font-medium"
          >
            Add widget
          </button>
        {/if}
      </div>
    </div>
  {/snippet}
</Modal>
