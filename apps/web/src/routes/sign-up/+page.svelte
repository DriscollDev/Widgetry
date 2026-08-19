<!--
  Route: /sign-up - SCR-AUTH-02 (Screen Inventory §5).

  Submits to the form action in +page.server.ts, which validates against the
  same shared schemas the checks below use ($lib/auth-forms), so nothing the
  form accepts can surprise the api.

  Password rules changed when this was wired up. The old lowercase/uppercase/
  number/symbol checks were never the api's policy: FR-1.5 is "at least 12
  characters, and not in a common-password blocklist". The character-class
  version rejected long passphrases the api accepts, which is both worse advice
  and a client disagreeing with its own server. The blocklist half runs on the
  api against the breach corpus, so it can only report at submit.

  States covered (§5.2): pristine, filling, validation error, submitting,
  email-already-taken.

  Still to do:
    - Google OAuth (FR-1.3, p1).
    - The Role select and the terms checkbox below are presentation only. There
      is no `role` column on the Better-Auth `user` table and no FR/US covering
      one, and /terms and /privacy do not exist yet - so neither field is
      submitted. Both need a scope decision before they can be wired.
-->
<script lang="ts">
  import { enhance } from '$app/forms';
  import { EmailField, MIN_PASSWORD_LENGTH, NameField, PasswordField } from '@widgetry/shared';
  import { fieldError } from '$lib/auth-forms.js';
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();

  // Seeded from a failed submission so a no-JS round trip keeps the fields;
  // the password is deliberately never echoed back.
  // Seeding from a failed submission is exactly the intent here: after
  // hydration the input owns the value, not `form`.
  // svelte-ignore state_referenced_locally
  let firstName = $state(form?.firstName ?? '');
  // svelte-ignore state_referenced_locally
  let lastName = $state(form?.lastName ?? '');
  // svelte-ignore state_referenced_locally
  let workEmail = $state(form?.email ?? '');
  let password = $state('');

  let firstNameError = $state('');
  let lastNameError = $state('');
  let emailError = $state('');
  let passwordError = $state('');
  let submitting = $state(false);

  function validateFirstName() {
    firstNameError = fieldError(NameField, firstName);
    return !firstNameError;
  }

  function validateLastName() {
    lastNameError = fieldError(NameField, lastName);
    return !lastNameError;
  }

  function validateEmail() {
    emailError = fieldError(EmailField, workEmail);
    return !emailError;
  }

  function validatePassword() {
    passwordError = fieldError(PasswordField, password);
    return !passwordError;
  }
</script>

<a href="/dev" style="color: aqua;">Dev</a>
<!-- DEV LINK TODO: REMOVE LATER-->
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
        const valid = [
          validateFirstName(),
          validateLastName(),
          validateEmail(),
          validatePassword(),
        ].every(Boolean);
        if (!valid) return cancel();

        submitting = true;
        return async ({ update }) => {
          await update({ reset: false });
          submitting = false;
        };
      }}
    >
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label for="first-name" class="mb-1.5 block text-sm text-neutral-300">First name</label>
          <input
            id="first-name"
            name="firstName"
            type="text"
            autocomplete="given-name"
            placeholder="Adrian"
            bind:value={firstName}
            onblur={validateFirstName}
            aria-invalid={!!(firstNameError || form?.fieldErrors?.firstName)}
            class="w-full rounded-lg border bg-neutral-800/60 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            class:border-neutral-700={!(firstNameError || form?.fieldErrors?.firstName)}
            class:border-red-500={!!(firstNameError || form?.fieldErrors?.firstName)}
          />
          {#if firstNameError || form?.fieldErrors?.firstName}
            <p class="mt-1 text-xs text-red-400">
              {firstNameError || form?.fieldErrors?.firstName}
            </p>
          {/if}
        </div>
        <div>
          <label for="last-name" class="mb-1.5 block text-sm text-neutral-300">Last name</label>
          <input
            id="last-name"
            name="lastName"
            type="text"
            autocomplete="family-name"
            placeholder="D."
            bind:value={lastName}
            onblur={validateLastName}
            aria-invalid={!!(lastNameError || form?.fieldErrors?.lastName)}
            class="w-full rounded-lg border bg-neutral-800/60 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            class:border-neutral-700={!(lastNameError || form?.fieldErrors?.lastName)}
            class:border-red-500={!!(lastNameError || form?.fieldErrors?.lastName)}
          />
          {#if lastNameError || form?.fieldErrors?.lastName}
            <p class="mt-1 text-xs text-red-400">{lastNameError || form?.fieldErrors?.lastName}</p>
          {/if}
        </div>
      </div>

      <div>
        <label for="work-email" class="mb-1.5 block text-sm text-neutral-300">Work email</label>
        <input
          id="work-email"
          name="email"
          type="email"
          autocomplete="email"
          placeholder="you@adriand.dev"
          bind:value={workEmail}
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
        <label for="password" class="mb-1.5 block text-sm text-neutral-300">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autocomplete="new-password"
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
        {:else}
          <p class="mt-1 text-xs text-neutral-500">
            At least {MIN_PASSWORD_LENGTH} characters. A long passphrase beats a short complicated one.
          </p>
        {/if}
      </div>

      <!--
        Presentation only - see the file header. No `name` attribute, so nothing
        is submitted and nothing is silently discarded server-side either.
      -->
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
        disabled={submitting}
        class="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Creating your account…' : 'Continue to workspace setup'}
      </button>
    </form>

    <p class="mt-6 text-center text-sm text-neutral-400">
      Already have an account? <a href="/sign-in" class="text-blue-400 hover:text-blue-300"
        >Sign in</a
      >
    </p>
  </div>
</div>
