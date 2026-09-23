<script lang="ts">
  import type { z } from 'zod';
  import { fieldsFor, optionLabel } from './config-fields';

  type Props = {
    schema: z.ZodType;
    values: Record<string, string>;
    errors?: Record<string, string>;
  };

  let { schema, values = $bindable(), errors = {} }: Props = $props();

  // The schema walk lives in ./config-fields.ts so the SUBMIT path can share
  // it. It could not before, and the result was that only this side knew a
  // field's type - see that module's note on the coercion that never happened.
  const fields = $derived(fieldsFor(schema));
</script>

<div class="flex flex-col gap-4">
  {#each fields as field (field.key)}
    <div>
      <label for={field.key} class="mb-1.5 block text-xs text-surface-600-400">
        {field.label}
      </label>
      {#if field.kind === 'select'}
        <select
          id={field.key}
          bind:value={values[field.key]}
          class="w-full rounded-lg border border-surface-200-800 bg-surface-100-900 px-3 py-2 text-sm text-surface-950-50"
        >
          {#each field.options ?? [] as opt (opt)}
            <option value={opt}>{optionLabel(opt)}</option>
          {/each}
        </select>
      {:else if field.kind === 'checkbox'}
        <input
          id={field.key}
          type="checkbox"
          checked={values[field.key] === 'true'}
          onchange={(e) => (values[field.key] = String(e.currentTarget.checked))}
        />
      {:else}
        <input
          id={field.key}
          type={field.kind}
          bind:value={values[field.key]}
          class="w-full rounded-lg border px-3 py-2 text-sm text-surface-950-50 {errors[field.key]
            ? 'border-error-500'
            : 'border-surface-200-800'} bg-surface-100-900"
        />
      {/if}
      {#if errors[field.key]}
        <p class="mt-1 text-xs text-error-500">{errors[field.key]}</p>
      {/if}
    </div>
  {/each}
</div>
