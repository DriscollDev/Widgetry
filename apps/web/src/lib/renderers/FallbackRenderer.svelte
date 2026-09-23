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

<div class="renderer-fallback">
  <span>{widget.widgetType}</span>
</div>

<style>
  .renderer-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    pointer-events: none;
    /* See ClockRenderer's matching comment - BoardView's cell no longer
       draws the card. */
    border-radius: 0.75rem;
    background: light-dark(var(--color-surface-50), var(--color-surface-950));
    border: 1px solid light-dark(var(--color-surface-200), var(--color-surface-800));
    padding: 1rem;
    box-sizing: border-box;
  }

  .renderer-fallback span {
    font-family: var(--font-mono, monospace);
    font-size: 0.8rem;
    color: light-dark(var(--color-surface-700), var(--color-surface-200));
  }
</style>
