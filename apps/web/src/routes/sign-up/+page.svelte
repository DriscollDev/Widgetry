<!--
  Route: /sign-up - SCR-AUTH-02 (Screen Inventory §5).

  Client-side field validation only - no auth call wired up yet.
  TODO (frontend): wire this up.
    - Submit to /v1 auth via a SvelteKit form action (+page.server.ts),
      validating against the shared Zod schema in packages/shared/src/api/
      instead of the ad-hoc checks below.
    - Role select - populate options from the shared enum.
    - Terms/privacy links -> real routes.
    - Links to /sign-in (SCR-AUTH-01).
    - States: submitting, invalid-credentials error.
    - On success: redirect per Screen Inventory §4 (last board or /boards).
-->
<script lang="ts">
  let firstName = $state('');
  let lastName = $state('');
  let workEmail = $state('');
  let password = $state('');
  let firstNameError = $state('');
  let lastNameError = $state('');
  let emailError = $state('');
  let passwordError = $state('');

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;

  function validateFirstName() {
    firstNameError = firstName.trim() ? '' : 'First name is required.';
    return !firstNameError;
  }

  function validateLastName() {
    lastNameError = lastName.trim() ? '' : 'Last name is required.';
    return !lastNameError;
  }

  function validateEmail() {
    emailError = EMAIL_PATTERN.test(workEmail) ? '' : 'Enter an email address with an @ in it.';
    return !emailError;
  }

  function validatePassword() {
    if (!/[a-z]/.test(password)) {
      passwordError = 'Password needs a lowercase letter.';
    } else if (!/[A-Z]/.test(password)) {
      passwordError = 'Password needs an uppercase letter.';
    } else if (!/[0-9]/.test(password)) {
      passwordError = 'Password needs a number.';
    } else if (!/[^A-Za-z0-9]/.test(password)) {
      passwordError = 'Password needs a symbol.';
    } else {
      passwordError = '';
    }
    return !passwordError;
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const firstNameValid = validateFirstName();
    const lastNameValid = validateLastName();
    const emailValid = validateEmail();
    const passwordValid = validatePassword();
    if (firstNameValid && lastNameValid && emailValid && passwordValid) {
      // TODO: call /v1 auth once the backend is wired up.
    }
  }
</script>

<div class="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
  <div class="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-8 shadow-xl">
    <div class="mb-6 flex items-center gap-2">
      <div
        class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-semibold text-white"
      >
        W
      </div>
      <span class="text-sm font-medium text-neutral-200">Widgetry</span>
    </div>

    <h1 class="text-2xl font-semibold text-white">Your profile</h1>
    <p class="mt-1 text-sm text-neutral-400">Tell us a bit about yourself</p>

    <form class="mt-6 space-y-4" onsubmit={handleSubmit} novalidate>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label for="first-name" class="mb-1.5 block text-sm text-neutral-300">First name</label>
          <input
            id="first-name"
            type="text"
            placeholder="Adrian"
            bind:value={firstName}
            onblur={validateFirstName}
            aria-invalid={!!firstNameError}
            class="w-full rounded-lg border bg-neutral-800/60 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            class:border-neutral-700={!firstNameError}
            class:border-red-500={!!firstNameError}
          />
          {#if firstNameError}
            <p class="mt-1 text-xs text-red-400">{firstNameError}</p>
          {/if}
        </div>
        <div>
          <label for="last-name" class="mb-1.5 block text-sm text-neutral-300">Last name</label>
          <input
            id="last-name"
            type="text"
            placeholder="D."
            bind:value={lastName}
            onblur={validateLastName}
            aria-invalid={!!lastNameError}
            class="w-full rounded-lg border bg-neutral-800/60 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            class:border-neutral-700={!lastNameError}
            class:border-red-500={!!lastNameError}
          />
          {#if lastNameError}
            <p class="mt-1 text-xs text-red-400">{lastNameError}</p>
          {/if}
        </div>
      </div>

      <div>
        <label for="work-email" class="mb-1.5 block text-sm text-neutral-300">Work email</label>
        <input
          id="work-email"
          type="email"
          placeholder="you@adriand.dev"
          bind:value={workEmail}
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
        <label for="password" class="mb-1.5 block text-sm text-neutral-300">Password</label>
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
        {:else}
          <p class="mt-1 text-xs text-neutral-500">
            Must include a lowercase, uppercase, number, and symbol.
          </p>
        {/if}
      </div>

      <div>
        <label for="role" class="mb-1.5 block text-sm text-neutral-300">Role</label>
        <div class="relative">
          <select
            id="role"
            class="w-full appearance-none rounded-lg border border-neutral-700 bg-neutral-800/60 px-3 py-2 text-sm text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="" selected disabled>Select your role</option>
            <option value="engineer">Engineer</option>
            <option value="designer">Designer</option>
            <option value="product-manager">Product Manager</option>
            <option value="marketing">Marketing</option>
            <option value="data-analyst">Data Analyst</option>
            <option value="customer-support">Customer Support</option>
            <option value="founder">Founder / Executive</option>
          </select>
          <svg
            viewBox="0 0 24 24"
            class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>

      <label class="flex items-start gap-2 text-sm text-neutral-300">
        <input
          type="checkbox"
          checked
          class="mt-0.5 h-4 w-4 rounded border-neutral-600 bg-neutral-800 text-blue-600 focus:ring-blue-500"
        />
        <span>
          I agree to the <a href="/terms" class="text-blue-400 hover:text-blue-300"
            >terms of service</a
          >
          and
          <a href="/privacy" class="text-blue-400 hover:text-blue-300">privacy policy</a>
        </span>
      </label>

      <button
        type="submit"
        class="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-500"
      >
        Continue to workspace setup
      </button>
    </form>

    <p class="mt-6 text-center text-sm text-neutral-400">
      Already have an account? <a href="/sign-in" class="text-blue-400 hover:text-blue-300"
        >Sign in</a
      >
    </p>
  </div>
</div>
