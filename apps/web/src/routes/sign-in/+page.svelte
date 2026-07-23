<!--
  Route: /sign-in - SCR-AUTH-01 (Screen Inventory §5).

  TODO (frontend): build the sign-in screen.
    - Email + password form (validate against the shared Zod schema in
      packages/shared/src/api/ - do not hand-write a second schema).
    - "Sign in with Google" (OAuth via Better-Auth).
    - Links to /sign-up (SCR-AUTH-02) and /forgot-password (SCR-AUTH-03).
    - States: idle, submitting, invalid-credentials error.
    - On success: redirect per Screen Inventory §4 (last board or /boards).
  Submit via a SvelteKit form action (+page.server.ts) that calls /v1 auth.
-->
<h1>Sign in</h1>
