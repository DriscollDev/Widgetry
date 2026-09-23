<!--
  Route: +error.svelte - SCP-041.

  Before this, any 404 or 5xx landed on SvelteKit's built-in error page:
  unstyled, black-on-white, and carrying the framework's name rather than the
  product's. This is the app's own.

  It sits at the ROOT so it catches every route. The app shell renders above it
  when the visitor is signed in (routes/+layout.svelte gates on `data.user`),
  so a signed-in user keeps their nav and can get out with one click; a
  signed-out one gets the sign-in link below.

  Uses the Skeleton token system, so it follows the theme rather than the
  hardcoded palette of the signed-out screens. An error page is the one screen
  guaranteed to be seen in an unexpected context, so it should not assume which
  half of the app it interrupted.
-->
<script lang="ts">
  import { page } from '$app/state';

  // `error.message` is SvelteKit's, and for an uncaught 500 in production it is
  // the deliberately vague "Internal Error" - shown as-is rather than replaced,
  // because the alternative is inventing detail we do not have. A 404 gets a
  // sentence written for it, since "Not Found" alone tells a user nothing about
  // what to do next.
  const isNotFound = $derived(page.status === 404);
  const heading = $derived(isNotFound ? 'Page not found' : 'Something went wrong');
  const detail = $derived(
    isNotFound
      ? 'The page you asked for does not exist, or it belonged to something that has since been deleted.'
      : (page.error?.message ?? 'The page could not be loaded.'),
  );
</script>

<svelte:head><title>{heading} · Widgetry</title></svelte:head>

<main class="mx-auto flex max-w-lg flex-col items-center gap-4 px-6 py-24 text-center">
  <p class="font-mono text-sm text-surface-600-400">{page.status}</p>
  <h1 class="text-2xl font-semibold text-surface-950-50">{heading}</h1>
  <p class="text-sm text-surface-600-400">{detail}</p>

  <div class="mt-2 flex items-center gap-3">
    <a href="/boards" class="preset-filled-primary-500 rounded-lg px-4 py-2 text-sm font-medium">
      Go to your boards
    </a>
    <a
      href="/faq"
      class="rounded-lg border border-surface-200-800 px-4 py-2 text-sm font-medium text-surface-950-50 hover:bg-surface-200-800"
    >
      FAQ
    </a>
  </div>
</main>
