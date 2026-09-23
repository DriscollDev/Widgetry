<!--
  The renderer for a widget type that has no adapter yet (Story #223).

  Looks exactly like the placeholder BoardView drew before renderers existed: the
  type name in monospace. pointer-events is off so a press on the label still
  reaches the widget and starts a drag.
-->
<script lang="ts">
  import { WIDGET_CARD } from './card';
  import type { RenderableWidget } from './types';

  let { widget }: { widget: RenderableWidget } = $props();
</script>

<div class="{WIDGET_CARD} renderer-fallback pointer-events-none">
  <span>{widget.widgetType}</span>
</div>

<style>
  .renderer-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .renderer-fallback span {
    font-family: var(--font-mono, monospace);
    font-size: 0.8rem;
    color: light-dark(var(--color-surface-700), var(--color-surface-200));
  }
</style>
