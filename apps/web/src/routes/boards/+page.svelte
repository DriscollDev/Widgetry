<!--
  Route: /boards - SCR-APP-01, board list (Screen Inventory §5).

  Auth is done: the guard in hooks.server.ts redirects an unauthenticated
  visitor to /sign-in?returnTo=/boards, and `$page.data.user` (from
  +layout.server.ts) holds the signed-in user.

  TODO (frontend): build the board list screen.
    - Load the user's boards (GET /v1/boards) in a +page.server.ts load().
    - Grid/list of board cards; click -> /boards/:id (SCR-APP-02).
    - "New board" -> create-board modal (SCR-MOD-01).
    - Empty state prompting board creation when the user has none.
    - Unverified-email banner (EX-16) keyed off `user.emailVerified`. Its
      "resend" control needs POST /v1/auth/send-verification-email, which the
      api has but no screen calls yet.
-->
<h1>Your boards</h1>
<a href="/dev" style="color: aqua;">Dev</a> <!-- DEV LINK TODO: REMOVE LATER-->