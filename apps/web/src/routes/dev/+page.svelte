<!--
  Route: /dev - developer route index. NOT a product screen, not in the Screen
  Inventory, not covered by any FR/US. Delete this directory before the
  production push (+page.server.ts already 404s it outside `vite dev`).

  What it is for: clicking through the auth routes and watching what the guard,
  the session hook and the /v1 proxy actually do, without curl.
-->
<script lang="ts">
  import { apiUrl } from '$lib/api.js';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  type Probe = { href: string; label: string; expect: string };

  const authRoutes: Probe[] = [
    { href: '/', label: '/', expect: 'router: -> /sign-in signed out, -> /boards signed in' },
    {
      href: '/sign-in',
      label: '/sign-in',
      expect: 'form; redirects to /boards if already signed in',
    },
    {
      href: '/sign-in?returnTo=%2Fboards',
      label: '/sign-in?returnTo=/boards',
      expect: 'session-expired notice above the form',
    },
    {
      href: '/sign-up',
      label: '/sign-up',
      expect: 'form; redirects to /boards if already signed in',
    },
    {
      href: '/boards',
      label: '/boards',
      expect: 'protected: -> /sign-in?returnTo=/boards when signed out',
    },
  ];

  // safeReturnTo() should send every one of these to /boards rather than off
  // the origin. If any of them leaves localhost, that is a live open redirect.
  const openRedirectProbes: Probe[] = [
    {
      href: '/sign-in?returnTo=https%3A%2F%2Fexample.com%2Fsteal',
      label: 'returnTo=https://example.com/steal',
      expect: 'absolute URL rejected -> /boards',
    },
    {
      href: '/sign-in?returnTo=%2F%2Fexample.com%2Fsteal',
      label: 'returnTo=//example.com/steal',
      expect: 'scheme-relative rejected -> /boards',
    },
    {
      href: '/sign-in?returnTo=%2F%5Cexample.com',
      label: 'returnTo=/\\example.com',
      expect: 'backslash form rejected -> /boards',
    },
    {
      href: '/sign-in?returnTo=%2Fsign-in',
      label: 'returnTo=/sign-in',
      expect: 'self-reference rejected -> /boards',
    },
  ];

  // Screens the api supports but nobody has built (SCR-AUTH-03/04/05). Listed
  // so the gap is visible: these are not 404s, they hit the deny-by-default
  // guard and bounce to /sign-in.
  const notBuilt: Probe[] = [
    { href: '/forgot-password', label: '/forgot-password', expect: 'SCR-AUTH-03 - no screen yet' },
    {
      href: '/reset-password?token=example',
      label: '/reset-password?token=…',
      expect: 'SCR-AUTH-04 - no screen yet; the api mails links here',
    },
    { href: '/verify-email', label: '/verify-email', expect: 'SCR-AUTH-05 - no screen yet' },
  ];

  const otherDevPages: Probe[] = [
    {
      href: '/dev/widget-gallery',
      label: '/dev/widget-gallery',
      expect: 'widget renderers on fixtures',
    },
    { href: '/dev/board-view', label: '/dev/board-view', expect: 'board grid on fixtures' },
  ];

  // ---- /v1 probes, run from the browser -----------------------------------
  // Deliberately client-side: this exercises the proxy hop in hooks.server.ts
  // the way the browser reaches it, which is a different path from the
  // server-side calls a `load` makes.
  const apiProbes = [
    { path: 'health', label: 'GET /v1/health', expect: '200 {"status":"ok"}' },
    {
      path: 'me',
      label: 'GET /v1/me',
      expect: '200 {user, session} signed in, 401 signed out - this is what the session hook reads',
    },
    {
      path: 'auth/get-session',
      label: 'GET /v1/auth/get-session',
      expect:
        "Better-Auth's own shape: 200 with a null body when signed out. Web no longer uses it.",
    },
  ];

  let results = $state<Record<string, string>>({});
  let running = $state<string | null>(null);

  async function probe(path: string) {
    running = path;
    try {
      const response = await fetch(apiUrl(path), { headers: { accept: 'application/json' } });
      const text = await response.text();
      results[path] = `${response.status} ${response.statusText}\n${text || '(empty body)'}`;
    } catch (err) {
      results[path] = `fetch failed: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      running = null;
    }
  }
</script>

<div class="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-200">
  <div class="mx-auto max-w-3xl space-y-8">
    <header>
      <p class="text-xs font-medium uppercase tracking-wider text-amber-500">Developer tools</p>
      <h1 class="mt-1 text-2xl font-semibold text-white">Route harness</h1>
      <p class="mt-1 text-sm text-neutral-400">
        Not a product screen. This page 404s outside <code class="text-neutral-300">dev</code>.
      </p>
    </header>

    <!-- Session state, straight off `locals` - the same value every load sees. -->
    <section class="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <h2 class="text-sm font-semibold text-white">Session</h2>
      {#if data.user}
        <dl class="mt-3 grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt class="text-neutral-500">Signed in</dt>
          <dd class="text-emerald-400">yes</dd>
          <dt class="text-neutral-500">id</dt>
          <dd class="break-all font-mono text-xs text-neutral-300">{data.user.id}</dd>
          <dt class="text-neutral-500">email</dt>
          <dd class="text-neutral-300">{data.user.email}</dd>
          <dt class="text-neutral-500">name</dt>
          <dd class="text-neutral-300">{data.user.name}</dd>
          <dt class="text-neutral-500">createdAt</dt>
          <dd class="text-neutral-300">{data.user.createdAt}</dd>
          <dt class="text-neutral-500">emailVerified</dt>
          <dd class={data.user.emailVerified ? 'text-emerald-400' : 'text-amber-400'}>
            {data.user.emailVerified}
            {#if !data.user.emailVerified}
              <span class="text-neutral-500">- EX-16 banner state</span>
            {/if}
          </dd>
        </dl>

        <!--
          Posts to the real /sign-out route rather than a local action, so this
          button tests the thing that ships. It lands on /sign-in, per §4.
        -->
        <form method="POST" action="/sign-out" class="mt-4">
          <button
            type="submit"
            class="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-700"
          >
            Sign out (POST /sign-out → /sign-in)
          </button>
        </form>
      {:else}
        <p class="mt-2 text-sm text-neutral-400">
          Signed out. <a href="/sign-up" class="text-blue-400 hover:text-blue-300"
            >Create an account</a
          >
          or <a href="/sign-in" class="text-blue-400 hover:text-blue-300">sign in</a> to populate this.
        </p>
        <p class="mt-2 text-xs text-neutral-500">
          Sign-up needs a password of at least 12 characters (FR-1.5). With RESEND_API_KEY unset the
          api logs the verification link to its console instead of sending it.
        </p>
      {/if}
    </section>

    {#snippet routeList(title: string, note: string, items: Probe[])}
      <section class="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <h2 class="text-sm font-semibold text-white">{title}</h2>
        <p class="mt-1 text-xs text-neutral-500">{note}</p>
        <ul class="mt-3 divide-y divide-neutral-800">
          {#each items as item (item.href)}
            <li class="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
              <a href={item.href} class="font-mono text-sm text-blue-400 hover:text-blue-300">
                {item.label}
              </a>
              <span class="text-xs text-neutral-500">{item.expect}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/snippet}

    {@render routeList(
      'Auth routes',
      'Behaviour depends on whether you are signed in - check the session box above first.',
      authRoutes,
    )}

    {@render routeList(
      'Open-redirect probes',
      'Every one of these should land you on /boards. If any navigates off localhost, safeReturnTo() has a hole.',
      openRedirectProbes,
    )}

    {@render routeList(
      'Screens the api supports but nobody has built',
      'These hit the deny-by-default guard and bounce to /sign-in rather than 404ing.',
      notBuilt,
    )}

    {@render routeList('Other dev pages', 'Fixture-driven, no backend.', otherDevPages)}

    <section class="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <h2 class="text-sm font-semibold text-white">/v1 proxy probes</h2>
      <p class="mt-1 text-xs text-neutral-500">
        Run from the browser, so these exercise the same-origin proxy hop rather than the
        server-side path a load() takes.
      </p>
      <ul class="mt-3 space-y-3">
        {#each apiProbes as item (item.path)}
          <li>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <button
                type="button"
                onclick={() => probe(item.path)}
                disabled={running === item.path}
                class="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 font-mono text-xs text-neutral-200 hover:bg-neutral-700 disabled:opacity-60"
              >
                {running === item.path ? 'running…' : item.label}
              </button>
              <span class="text-xs text-neutral-500">{item.expect}</span>
            </div>
            {#if results[item.path]}
              <pre
                class="mt-2 overflow-x-auto rounded-lg bg-neutral-950 p-3 font-mono text-xs text-neutral-300">{results[
                  item.path
                ]}</pre>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  </div>
</div>
