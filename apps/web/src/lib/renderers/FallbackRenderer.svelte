<!--
  The renderer for a widget type that has no adapter yet (Story #223).

  Looks exactly like the placeholder BoardView drew before renderers existed: the
  type name in monospace. pointer-events is off so a press on the label still
  reaches the widget and starts a drag.
-->
<script lang="ts">
  import type { RenderableWidget } from './types';

  let { widget }: { widget: RenderableWidget } = $props();
</script>

<span class="renderer-fallback">{widget.widgetType}</span>

<style>
  .renderer-fallback {
    font-family: var(--font-mono, monospace);
    font-size: 0.8rem;
    color: light-dark(var(--color-surface-700), var(--color-surface-200));
    pointer-events: none;
  }
</style>
