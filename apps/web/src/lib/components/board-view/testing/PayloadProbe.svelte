<!-- Test-only stand-in renderer (Task #236): prints the config and latest it was given. -->
<script lang="ts">
  import type { RenderableWidget } from '$lib/renderers/types';

  export let widget: RenderableWidget;
</script>

<span data-testid={`probe-${widget.id}`}
  >{JSON.stringify({ config: widget.config ?? null, latest: widget.latest ?? null })}</span
>
