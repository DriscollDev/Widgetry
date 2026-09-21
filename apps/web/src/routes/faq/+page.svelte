<!--
  Route: /faq - help and orientation.

  SCOPE NOTE: this screen has no SCR-* id. Screen Inventory §5 lists three
  post-auth surfaces (board list, board view, account) and no help page, and
  no FR covers it. Built on product request; needs a Screen Inventory entry
  before it counts as in-scope.

  Public on purpose: the questions below are what someone asks BEFORE signing
  up, so gating it behind the auth guard would hide it from its main audience.
  Registered in PUBLIC_PATHS in hooks.server.ts.

  Every number here is quoted from the spec rather than invented - FR-2.1
  (10 boards), FR-3.5 (20 widgets), FR-3.1 (12-column grid), FR-4.2 (1 hour
  minimum poll), FR-2.3 (board refresh range), FR-5.2 (12h-30d retention),
  FR-1.7 (verification). Update both together if any of them move.
-->
<script lang="ts">
  type Entry = { q: string; a: string };

  const basics: Entry[] = [
    {
      q: 'What is Widgetry?',
      a: 'A dashboard for APIs you care about. You build boards out of widgets, and each widget shows a live value pulled from an API — a server’s uptime, the weather where you are, a stock price, or any JSON endpoint of your own.',
    },
    {
      q: 'What is a board?',
      a: 'A single screen of widgets, arranged on a grid. Most people keep one per context — a "home server" board, a "work services" board. You can own up to 10.',
    },
    {
      q: 'What is a widget?',
      a: 'One tile on a board, tied to one data source. Widgetry ships ready-made types for uptime checks, weather, stocks, currency, clocks and date/time, plus a custom type that reads any JSON API you point it at. A board holds up to 20.',
    },
  ];

  const using: Entry[] = [
    {
      q: 'How do I add a widget?',
      a: 'Open a board and choose Add widget. Pick a type from the catalog, then fill in where its data comes from — usually an endpoint URL and, for custom widgets, which field inside the response to read.',
    },
    {
      q: 'How do I arrange widgets?',
      a: 'Drag a widget to move it and pull its edges to resize. The grid is 12 columns wide and a widget can span from 1×1 up to 6×6. Widgets cannot overlap — if you drop one on top of another it snaps back to where it was, and nothing else on the board moves.',
    },
    {
      q: 'How often does my data update?',
      a: 'Two separate things. A board re-checks for new values on a schedule you choose, from every 30 seconds up to hourly. Separately, widgets that Widgetry polls on your behalf — uptime, stock, custom JSON — fetch from the upstream API at most once an hour, which keeps you inside the rate limits of most free API plans.',
    },
    {
      q: 'Can I see history?',
      a: 'For widget types that support it, yes. Widgetry keeps snapshots so you can view a value over time, and you choose how long to keep them per widget — anywhere from 12 hours to 30 days, with 7 days as the default.',
    },
  ];

  const custom: Entry[] = [
    {
      q: 'What can a custom widget connect to?',
      a: 'Any HTTP or HTTPS endpoint that returns JSON. You give Widgetry the URL, any authentication it needs, and a path to the field you want — like data.players.online — and it shows that value on your board.',
    },
    {
      q: 'Is my API key safe?',
      a: 'Keys are encrypted before they are stored and are only ever used server-side, when Widgetry makes the request on your behalf. They are never sent to your browser and never appear in a response.',
    },
    {
      q: 'Why was my URL rejected?',
      a: 'Widgetry only fetches public http:// and https:// addresses. URLs that resolve to private or internal networks are refused, which stops a dashboard from being used to probe machines it should not reach.',
    },
  ];

  const account: Entry[] = [
    {
      q: 'Do I have to verify my email?',
      a: 'You can use Widgetry right away without verifying. Until you do, you will see a reminder, and you will not be able to reset a forgotten password — so it is worth doing early.',
    },
    {
      q: 'How do I change my password?',
      a: 'On the Account page, under Change password. You will need your current password. Changing it signs out your other devices but keeps you signed in here.',
    },
    {
      q: 'I forgot my password.',
      a: 'Use the forgot-password link on the sign-in screen and follow the emailed link, which is valid for one hour. This only works for verified accounts.',
    },
  ];

  const sections: { title: string; entries: Entry[] }[] = [
    { title: 'The basics', entries: basics },
    { title: 'Using Widgetry', entries: using },
    { title: 'Custom widgets', entries: custom },
    { title: 'Your account', entries: account },
  ];
</script>

<svelte:head><title>FAQ · Widgetry</title></svelte:head>

<div class="mx-auto flex max-w-2xl flex-col gap-8 p-6">
  <header>
    <h1 class="text-2xl font-semibold text-surface-950-50">Help &amp; FAQ</h1>
    <p class="mt-1 text-sm text-surface-600-400">
      What Widgetry is, and how to get a board working.
    </p>
  </header>

  {#each sections as section (section.title)}
    <section class="flex flex-col gap-3">
      <h2 class="text-sm font-semibold tracking-wide text-surface-600-400 uppercase">
        {section.title}
      </h2>

      {#each section.entries as entry (entry.q)}
        <!-- <details> rather than a JS accordion: it is keyboard accessible
             and findable with in-page search without hydrating. -->
        <details class="group rounded-xl border border-surface-200-800 bg-surface-50-950">
          <summary
            class="flex cursor-pointer items-center justify-between gap-3 p-4 text-sm font-medium text-surface-950-50"
          >
            {entry.q}
            <svg
              viewBox="0 0 24 24"
              class="size-4 shrink-0 text-surface-600-400 transition-transform group-open:rotate-180"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </summary>
          <p class="px-4 pb-4 text-sm leading-relaxed text-surface-600-400">{entry.a}</p>
        </details>
      {/each}
    </section>
  {/each}

  <p class="text-sm text-surface-600-400">
    Still stuck? Check your <a href="/account" class="text-primary-500 hover:underline">account</a>
    settings, or head back to your
    <a href="/boards" class="text-primary-500 hover:underline">boards</a>.
  </p>
</div>
