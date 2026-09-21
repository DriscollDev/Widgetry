<script lang="ts">
  type Props = {
    value: number | string;
    unit?: string;
    /** Compact slots get a smaller type scale than feature slots. */
    size?: 'feature' | 'compact';
  };

  let { value, unit = '', size = 'feature' }: Props = $props();

  let display = $derived(typeof value === 'number' ? value.toLocaleString() : value);
</script>

<p
  class="font-mono font-semibold text-surface-950-50 {size === 'feature' ? 'text-3xl' : 'text-lg'}"
>
  {display}{#if unit}<span class="ml-1 text-sm font-normal text-surface-600-400">{unit}</span>{/if}
</p>
