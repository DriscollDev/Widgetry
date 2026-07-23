<!--
  Route: `/` (Screen Inventory §4 - router, not a real screen).

  TODO (frontend): this is a redirect target, not a landing page.
    - Signed out            -> redirect to /sign-in
    - Signed in, ≥1 board   -> redirect to /boards/:id (most recently updated)
    - Signed in, no boards  -> redirect to /boards (empty state)
  Implement the redirect in a `+page.server.ts` load() once auth exists.
-->
<h1>Widgetry</h1>
