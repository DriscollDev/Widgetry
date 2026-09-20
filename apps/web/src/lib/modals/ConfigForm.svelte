<script lang="ts">
  import { z } from 'zod';

  type Props = {
    schema: z.ZodTypeAny;
    values: Record<string, string>;
    errors?: Record<string, string>;
  };

  let { schema, values = $bindable(), errors = {} }: Props = $props();

  // Walks a strictObject/object schema's shape to derive renderable fields.
  // Hand-rolled per Eng Doc §7.4 - swap to a library only if this proves
  // painful across more field types than string/number/boolean/enum.
  function fieldsFor(s: z.ZodTypeAny) {
    const shape = (s as z.ZodObject).shape;
    if (!shape) return [];
    return Object.entries(shape).map(([key, fieldSchema]) => {
      let inner = fieldSchema as z.ZodTypeAny;
      // Zod v4: wrapped types (optional/default) expose their inner type via
      // `.unwrap()`, not `._def.innerType` (that was v3's private-API shape).
      type Unwrappable = { unwrap: () => z.ZodTypeAny };
      function isUnwrappable(x: z.ZodTypeAny): x is z.ZodTypeAny & Unwrappable {
        return typeof (x as unknown as Unwrappable).unwrap === 'function';
      }

      while (isUnwrappable(inner)) {
        inner = inner.unwrap();
      }

      let kind: 'text' | 'number' | 'checkbox' | 'select' = 'text';
      let options: string[] | undefined;

      if (inner instanceof z.ZodNumber) {
        kind = 'number';
      } else if (inner instanceof z.ZodBoolean) {
        kind = 'checkbox';
      } else if (inner instanceof z.ZodEnum) {
        kind = 'select';
        options = inner.options as string[];
      }

      const description = (fieldSchema as z.ZodTypeAny).description;
      return { key, kind, options, label: description ?? key };
    });
  }

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
            <option value={opt}>{opt}</option>
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
