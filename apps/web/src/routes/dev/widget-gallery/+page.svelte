<script lang="ts">
  import RingValueWidget from '$lib/widgets/RingValueWidget.svelte';
  import LineGraphWidget from '$lib/widgets/LineGraphWidget.svelte';
  import WideStatBarsWidget from '$lib/widgets/WideStatBarsWidget.svelte';
  import UptimeHistoryWidget from '$lib/widgets/UptimeHistoryWidget.svelte';
  import StatusListWidget from '$lib/widgets/StatusListWidget.svelte';
  import WeatherWidget from '$lib/widgets/WeatherWidget.svelte';
  import StockWidget from '$lib/widgets/StockWidget.svelte';
  import {
    ringValueFixture,
    lineGraphFixture,
    statBarFixture,
    uptimeHistoryFixture,
    statusListFixture,
    weatherFixture,
    stockFixture,
  } from '$lib/widgets/fixtures';
</script>

<div class="grid grid-cols-1 gap-4 p-8 sm:grid-cols-2 md:grid-cols-4">
  <RingValueWidget {...ringValueFixture} />
  <LineGraphWidget {...lineGraphFixture} />
  <WideStatBarsWidget {...statBarFixture} />
  <UptimeHistoryWidget {...uptimeHistoryFixture} />
  <StatusListWidget {...statusListFixture} />
  <WeatherWidget {...weatherFixture} />
  <StockWidget {...stockFixture} />
</div>
