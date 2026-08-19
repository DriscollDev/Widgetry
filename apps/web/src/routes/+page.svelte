<!--
  Route: `/` (Screen Inventory §4 - router, not a real screen).

  +page.server.ts redirects on every path through here, so this markup is only
  ever reached if that load somehow returns - it exists because SvelteKit wants
  a component for the route, not because anyone should see it.
-->
<h1>Widgetry</h1>
