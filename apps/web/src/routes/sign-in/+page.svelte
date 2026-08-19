<!--
  Route: /sign-in - SCR-AUTH-01 (Screen Inventory §5).

  Submits to the form action in +page.server.ts, so the screen works before
  hydration; `use:enhance` upgrades it in place to keep the submitting state
  and the typed-in values without a reload.

  Client-side checks only cover what the server would reject anyway, and they
  cover it more cheaply. Sign-in deliberately does not police password shape -
  that would leak the policy to an unauthenticated caller and lock out any
  account predating a policy change.

  States covered (§5.1): pristine, filling, submitting, invalid-credentials,
  rate-limited, session-expired (arrived via returnTo).

  Still to do:
    - Google OAuth (FR-1.3, p1) - the markup below is `hidden` until
      GOOGLE_OAUTH_CLIENT_ID/SECRET are configured, since the api only
      registers the provider when both are present.
    - The "Forgot password?" link points at /forgot-password (SCR-AUTH-03),
      which does not exist yet. The api half of the reset flow is built and
      working; only the two screens are missing.
-->
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // Seeded from the failed submission so the field survives a no-JS round
  // trip; with `use:enhance` the value never left the input in the first place.
  // Seeding from a failed submission is exactly the intent here: after
  // hydration the input owns the value, not `form`.
  // svelte-ignore state_referenced_locally
  let email = $state(form?.email ?? '');
  let password = $state('');
  let emailError = $state('');
  let passwordError = $state('');
  let submitting = $state(false);

  function validateEmail() {
    emailError = email.trim() ? '' : 'Email address is required.';
    return !emailError;
  }

  function validatePassword() {
    passwordError = password.trim() ? '' : 'Password is required.';
    return !passwordError;
  }
</script>

<a href="/dev" style="color: aqua;">Dev</a>
<!-- DEV LINK TODO: REMOVE LATER-->
<div class="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
  <div class="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-8 shadow-xl">
    <div class="mb-6 flex items-center gap-2">
      <div
        class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-semibold text-white"
      >
        W
      </div>
      <span class="text-sm font-medium text-neutral-200">Widgetry</span>
    </div>

    <h1 class="text-2xl font-semibold text-white">Welcome back</h1>
    <p class="mt-1 text-sm text-neutral-400">Sign in to your workspace</p>

    {#if data.sessionExpired && !form?.message}
      <p
        class="mt-4 rounded-lg border border-neutral-700 bg-neutral-800/60 px-3 py-2 text-sm text-neutral-300"
      >
        Your session expired. Sign in again to pick up where you left off.
      </p>
    {/if}

    {#if form?.message}
      <p
        class="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        role="alert"
      >
        {form.message}
      </p>
    {/if}
    <form
      class="mt-6 space-y-4"
      method="POST"
      novalidate
      use:enhance={({ cancel }) => {
        // Same two checks the action re-runs server-side; doing them here just
        // saves a round trip and a rate-limit slot.
        const valid = [validateEmail(), validatePassword()].every(Boolean);
        if (!valid) return cancel();

        submitting = true;
        return async ({ update }) => {
          await update({ reset: false });
          submitting = false;
        };
      }}
    >
      <input type="hidden" name="returnTo" value={data.returnTo} />

      <div>
        <label for="email" class="mb-1.5 block text-sm text-neutral-300">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          autocomplete="email"
          placeholder="you@adriand.dev"
          bind:value={email}
          onblur={validateEmail}
          aria-invalid={!!(emailError || form?.fieldErrors?.email)}
          class="w-full rounded-lg border bg-neutral-800/60 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          class:border-neutral-700={!(emailError || form?.fieldErrors?.email)}
          class:border-red-500={!!(emailError || form?.fieldErrors?.email)}
        />
        {#if emailError || form?.fieldErrors?.email}
          <p class="mt-1 text-xs text-red-400">{emailError || form?.fieldErrors?.email}</p>
        {/if}
      </div>

      <div>
        <div class="mb-1.5 flex items-center justify-between">
          <label for="password" class="text-sm text-neutral-300">Password</label>
          <a href="/forgot-password" class="text-sm text-blue-400 hover:text-blue-300 hidden"
            >Forgot password?</a
          >
          <!--HIDDEN UNTIL IMPLEMENTED TODO: UNHIDE -->
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autocomplete="current-password"
          placeholder="••••••••••••"
          bind:value={password}
          onblur={validatePassword}
          aria-invalid={!!(passwordError || form?.fieldErrors?.password)}
          class="w-full rounded-lg border bg-neutral-800/60 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          class:border-neutral-700={!(passwordError || form?.fieldErrors?.password)}
          class:border-red-500={!!(passwordError || form?.fieldErrors?.password)}
        />
        {#if passwordError || form?.fieldErrors?.password}
          <p class="mt-1 text-xs text-red-400">{passwordError || form?.fieldErrors?.password}</p>
        {/if}
      </div>

      <!--
        Unchecked, this sends nothing and Better-Auth issues a browser-session
        cookie instead of a persistent one. The 30-day server-side session
        lifetime (FR-1.4) is the same either way, which is why the label says
        30 days regardless.
      -->
      <label class="flex items-center gap-2 text-sm text-neutral-300">
        <input
          type="checkbox"
          name="rememberMe"
          checked
          class="h-4 w-4 rounded border-neutral-600 bg-neutral-800 text-blue-600 focus:ring-blue-500"
        />
        Remember me for 30 days
      </label>

      <button
        type="submit"
        disabled={submitting}
        class="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>

      <div class="hidden space-y-3">
        <!--HIDDEN UNTIL IMPLEMENTED TODO: UNHIDE -->
        <p class="text-center text-xs text-neutral-500">or continue with</p>

        <button
          type="button"
          class="w-full rounded-lg border border-neutral-700 bg-neutral-800/60 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
        >
          Google
        </button>
      </div>
    </form>

    <p class="mt-6 text-center text-sm text-neutral-400">
      Don't have an account? <a href="/sign-up" class="text-blue-400 hover:text-blue-300"
        >Create one</a
      >
    </p>
  </div>
</div>
