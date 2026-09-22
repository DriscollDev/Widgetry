<!--
  Route: `/` - the signed-out landing page.

  SCOPE NOTE: no SCR-* id yet, same status as /faq (see that route's own
  scope note) - product-requested, needs a Screen Inventory entry before it
  formally counts as in-scope. +page.server.ts still sends a signed-in
  visitor straight to their board; this only renders for a signed-out one.

  Visual language matches /sign-in and /sign-up exactly (neutral-950/900/800
  + blue-600, the "W" badge, rounded-2xl cards) rather than the Skeleton
  token system (light-dark(), preset-*) the rest of the app uses - those two
  screens are the closest concrete precedent for what's actually shipped, and
  this page links straight into them, so matching them beats matching the
  token convention they themselves don't yet follow. Hardcoded on purpose,
  same reasoning as those screens: this page doesn't flip with system
  light/dark preference, and that's consistent with them, not a bug.

  The board mock below is static markup, not the real widget components -
  those render through Skeleton's tokens and would mismatch this page's
  hardcoded palette under a light system preference. It shows Widgetry's
  actual shipped widget types (uptime, weather, stock, custom JSON) with
  representative numbers, not live data.
-->
<svelte:head><title>Widgetry - a board for the APIs you check by hand</title></svelte:head>

<div class="min-h-screen bg-neutral-950 text-neutral-200">
  <header class="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
    <div class="flex items-center gap-2">
      <div
        class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-semibold text-white"
      >
        W
      </div>
      <span class="text-sm font-medium text-neutral-200">Widgetry</span>
    </div>
    <nav class="flex items-center gap-6 text-sm">
      <a href="/faq" class="text-neutral-400 hover:text-neutral-200">FAQ</a>
      <a href="/sign-in" class="text-neutral-400 hover:text-neutral-200">Sign in</a>
      <a
        href="/sign-up"
        class="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500"
      >
        Get started
      </a>
    </nav>
  </header>

  <main class="mx-auto max-w-6xl px-6 pt-12 pb-24">
    <section class="grid gap-12 lg:grid-cols-2 lg:items-center">
      <div>
        <h1 class="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Your APIs, watched.
        </h1>
        <p class="mt-4 max-w-md text-lg text-neutral-400">
          Build a board out of the endpoints you check by hand - uptime, weather, a stock price, or
          any JSON API of your own - and let it check itself.
        </p>
        <div class="mt-8 flex items-center gap-4">
          <a
            href="/sign-up"
            class="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500"
          >
            Get started
          </a>
          <a
            href="/sign-in"
            class="rounded-lg border border-neutral-800 px-5 py-2.5 text-sm font-medium text-neutral-200 hover:bg-neutral-900"
          >
            Sign in
          </a>
        </div>
      </div>

      <!-- Board mock: four representative widget types, varied sizes, same
           grid feel as a real board without being one. -->
      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <p class="text-xs text-neutral-500">Uptime - widgetry.dev</p>
          <p class="mt-1 font-mono text-xs text-neutral-500">GET https://widgetry.dev/health</p>
          <p class="mt-3 font-mono text-3xl font-semibold text-white">
            99.9<span class="text-lg text-neutral-500">%</span>
          </p>
          <p class="text-xs text-neutral-500">uptime - last 30 days</p>
        </div>

        <div class="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <p class="text-xs text-neutral-500">Weather - Providence, RI</p>
          <p class="mt-2 font-mono text-3xl font-semibold text-white">52°</p>
          <p class="text-xs text-neutral-500">Partly cloudy</p>
        </div>

        <div class="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <p class="text-xs text-neutral-500">BTC</p>
          <p class="mt-2 font-mono text-2xl font-semibold text-white">
            $62,340
            <span class="ml-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs text-emerald-400"
              >&uarr; 2.4%</span
            >
          </p>
        </div>

        <div class="col-span-2 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <p class="text-xs text-neutral-500">Custom JSON - players online</p>
          <p class="mt-2 font-mono text-2xl font-semibold text-white">
            7 <span class="text-base text-neutral-500">/ 20</span>
          </p>
        </div>
      </div>
    </section>

    <section class="mt-24 grid gap-10 sm:grid-cols-3">
      <div>
        <h2 class="text-sm font-semibold text-white">Passive monitoring</h2>
        <p class="mt-2 text-sm text-neutral-400">
          Point a widget at your own deployments and dependencies. It polls, you glance.
        </p>
      </div>
      <div>
        <h2 class="text-sm font-semibold text-white">The daily glance board</h2>
        <p class="mt-2 text-sm text-neutral-400">
          Weather, a clock, currency, a stock price - one board, one look, no fuss.
        </p>
      </div>
      <div>
        <h2 class="text-sm font-semibold text-white">Any JSON API</h2>
        <p class="mt-2 text-sm text-neutral-400">
          Give it a URL and a dot-notation path to the field you want. That's the whole config.
        </p>
      </div>
    </section>
  </main>

  <footer class="border-t border-neutral-900">
    <div
      class="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-xs text-neutral-500"
    >
      <span>Widgetry</span>
      <a href="/faq" class="hover:text-neutral-300">Questions? Check the FAQ.</a>
    </div>
  </footer>
</div>
