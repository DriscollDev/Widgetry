<script lang="ts">
  import { STATUS_META, type WidgetStatus } from './status';

  type ServiceStatus = {
    name: string;
    status: WidgetStatus;
  };

  type Props = {
    title: string;
    services: ServiceStatus[];
  };

  let { title, services }: Props = $props();
</script>

<div class="flex flex-col gap-3 rounded-xl border border-surface-200-800 bg-surface-50-950 p-4">
  <p class="text-xs text-surface-600-400">{title}</p>
  <ul class="flex flex-col gap-2">
    {#each services as service (service.name)}
      <li class="flex items-center justify-between gap-2">
        <span class="flex items-center gap-2 text-sm text-surface-950-50">
          <span class="size-2 rounded-full {STATUS_META[service.status].dot}"></span>
          {service.name}
        </span>
        <span class="rounded px-2 py-0.5 text-xs {STATUS_META[service.status].badge}">
          {STATUS_META[service.status].label}
        </span>
      </li>
    {/each}
  </ul>
</div>
