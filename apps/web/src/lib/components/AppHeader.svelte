<!--
  App shell header (SCP-027, Screen Inventory §5).

  Rendered only for a signed-in user - see the gate in routes/+layout.svelte.
  The signed-out screens (/, /sign-in, /sign-up) carry their own chrome and a
  deliberately different, hardcoded palette; this uses the Skeleton token
  system the rest of the signed-in app uses, so it matches /boards and
  /account rather than the landing page.

  `pathname` is a prop rather than a read of $app/state inside this component,
  so the active-link rule can be tested by rendering the header at a path
  instead of mocking a SvelteKit module.
-->
<script lang="ts">
  import type { MeUser } from '@widgetry/shared';
  import AccountMenu from './AccountMenu.svelte';
  import BrandMark from './BrandMark.svelte';
  import { APP_NAV, isActive } from './app-header';

  let { user, pathname }: { user: MeUser; pathname: string } = $props();
</script>

<header class="border-b border-surface-200-800 bg-surface-50-950">
  <div class="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
    <a href="/boards" class="flex items-center gap-2" aria-label="Widgetry home">
      <BrandMark size={32} />
      <span class="text-sm font-medium text-surface-950-50">Widgetry</span>
    </a>

    <nav aria-label="Main" class="flex items-center gap-1">
      {#each APP_NAV as item (item.href)}
        {@const active = isActive(pathname, item.href)}
        <a
          href={item.href}
          class="rounded-lg px-3 py-1.5 text-sm hover:bg-surface-200-800 {active
            ? 'bg-surface-200-800 font-medium text-surface-950-50'
            : 'text-surface-600-400'}"
          aria-current={active ? 'page' : undefined}
        >
          {item.label}
        </a>
      {/each}
    </nav>

    <div class="ml-auto">
      <AccountMenu {user} />
    </div>
  </div>
</header>
