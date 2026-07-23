<!--
  Route: /boards - SCR-APP-01, board list (Screen Inventory §5).

  TODO (frontend): build the board list screen (protected - requires auth).
    - Load the user's boards (GET /v1/boards) in a +page.server.ts load().
    - Grid/list of board cards; click -> /boards/:id (SCR-APP-02).
    - "New board" -> create-board modal (SCR-MOD-01).
    - Empty state prompting board creation when the user has none.
    - Redirect to /sign-in if unauthenticated.
-->
<h1>Your boards</h1>
