<!--
  Route: /sign-in - SCR-AUTH-01 (Screen Inventory §5).

  Only checks that both fields are filled in - no format/strength checks.
  Sign-in isn't responsible for policing email/password shape, just that
  something was entered before submitting.
  TODO (frontend): wire this up.
    - Submit to /v1 auth via a SvelteKit form action (+page.server.ts).
    - Google / Discord OAuth (via Better-Auth).
    - Links to /sign-up (SCR-AUTH-02) and /forgot-password (SCR-AUTH-03).
    - States: submitting, invalid-credentials error.
    - On success: redirect per Screen Inventory §4 (last board or /boards).
-->
<script lang="ts">
  let email = $state('');
  let password = $state('');
  let emailError = $state('');
  let passwordError = $state('');

  function validateEmail() {
    emailError = email.trim() ? '' : 'Email address is required.';
    return !emailError;
  }

  function validatePassword() {
    passwordError = password.trim() ? '' : 'Password is required.';
    return !passwordError;
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const emailValid = validateEmail();
    const passwordValid = validatePassword();
    if (emailValid && passwordValid) {
      // TODO: call /v1 auth once the backend is wired up.
    }
  }
</script>

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

    <form class="mt-6 space-y-4" onsubmit={handleSubmit} novalidate>
      <div>
        <label for="email" class="mb-1.5 block text-sm text-neutral-300">Email address</label>
        <input
          id="email"
          type="email"
          placeholder="you@adriand.dev"
          bind:value={email}
          onblur={validateEmail}
          aria-invalid={!!emailError}
          class="w-full rounded-lg border bg-neutral-800/60 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          class:border-neutral-700={!emailError}
          class:border-red-500={!!emailError}
        />
        {#if emailError}
          <p class="mt-1 text-xs text-red-400">{emailError}</p>
        {/if}
      </div>

      <div>
        <div class="mb-1.5 flex items-center justify-between">
          <label for="password" class="text-sm text-neutral-300">Password</label>
          <a href="/forgot-password" class="text-sm text-blue-400 hover:text-blue-300"
            >Forgot password?</a
          >
        </div>
        <input
          id="password"
          type="password"
          placeholder="••••••••••••"
          bind:value={password}
          onblur={validatePassword}
          aria-invalid={!!passwordError}
          class="w-full rounded-lg border bg-neutral-800/60 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          class:border-neutral-700={!passwordError}
          class:border-red-500={!!passwordError}
        />
        {#if passwordError}
          <p class="mt-1 text-xs text-red-400">{passwordError}</p>
        {/if}
      </div>

      <label class="flex items-center gap-2 text-sm text-neutral-300">
        <input
          type="checkbox"
          checked
          class="h-4 w-4 rounded border-neutral-600 bg-neutral-800 text-blue-600 focus:ring-blue-500"
        />
        Remember me for 30 days
      </label>

      <button
        type="submit"
        class="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-500"
      >
        Sign in
      </button>

      <div class="hidden space-y-3">
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
