<script lang="ts">
  // Root layout - wraps every route.
  //
  // TODO (frontend): build the authenticated app shell here.
  //   - Persistent header / nav (logo, board switcher, account menu).
  //   - Skeleton UI layout primitives (AppBar / sidebar).
  //   - Unverified-email banner (Screen Inventory SCR-AUTH-02 post-signup).
  //   - Auth-aware chrome: signed-out routes (/sign-in, /sign-up, ...) should
  //     render WITHOUT the app shell; signed-in routes get the full chrome.
  //
  // Keep the `import '../app.css'` (global Tailwind + Skeleton styles) and the
  // `{@render children()}` call - the app won't render without them.
  import '../app.css';

  let { children } = $props();
</script>

{@render children()}
