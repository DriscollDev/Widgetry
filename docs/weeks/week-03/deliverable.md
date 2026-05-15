---
layout: week
title: Prototype
week_number: 3
hide_week_nav: true
permalink: /weeks/week-03/deliverable.html
---

The interactive prototype for Widgetry, built in Figma. The embedded frame below
is the live prototype; static screenshots and a direct Figma link are included so
the page remains useful if the embed is unreachable or the team's Figma sharing
settings change.

<!--
  Figma embed setup:
  1. In Figma, open the prototype file.
  2. Click Share → Get embed code (or use Figma's "Embed" option on a
     specific frame).
  3. Copy the value of the `src` attribute and paste it into the iframe
     below, replacing FIGMA_EMBED_URL.
  4. The Figma file must be set to "Anyone with the link can view" for the
     embed to render for unauthenticated visitors.

<iframe style="border: 1px solid rgba(0, 0, 0, 0.1);" width="800" height="450" src="https://embed.figma.com/design/9iuYKVkkgUVPudhdP8wVsv/Bachelors-Capstone?node-id=0-1&embed-host=share" allowfullscreen></iframe>


  Screenshot fallback:
  - Export 3-5 key screens from Figma as PNG (File → Export, 2x).
  - Save them to /assets/img/prototype/ with descriptive names.
  - List them in the gallery section below.
-->

<iframe
  class="embed-frame"
  src="https://embed.figma.com/design/9iuYKVkkgUVPudhdP8wVsv/Bachelors-Capstone?node-id=0-1&embed-host=share"
  title="Widgetry interactive prototype (Figma)"
  loading="lazy"
  allowfullscreen>
</iframe>

<p>
  <a href="https://www.figma.com/design/9iuYKVkkgUVPudhdP8wVsv/Bachelors-Capstone?node-id=0-1&t=kfXJXtB0L4eAFBTL-1" rel="noopener">Open prototype in Figma ↗</a>
</p>

## Key screens

A static screenshot tour for offline viewing and quick reference. Replace the
placeholder figures with actual exports as they become available.

<figure class="figure">
  <img src="{{ '/assets/img/prototype/board-view.png' | relative_url }}" alt="Board view with widgets arranged on the grid">
  <figcaption>Board view - the primary surface.</figcaption>
</figure>

<figure class="figure">
  <img src="{{ '/assets/img/prototype/widget-config.png' | relative_url }}" alt="Widget configuration modal">
  <figcaption>Widget configuration modal.</figcaption>
</figure>

<figure class="figure">
  <img src="{{ '/assets/img/prototype/sign-in.png' | relative_url }}" alt="Sign-in screen">
  <figcaption>Sign-in.</figcaption>
</figure>

## Scope of the prototype

The prototype covers the must-have user flows identified in the feature
specification: account creation and sign-in, board creation and management,
widget placement and configuration, and the custom widget setup flow. Polish
states (loading, error, empty) are represented selectively rather than
exhaustively - the engineering documentation is the source of truth for the
full state inventory.

## What the prototype is not

- **Not the final visual design.** The prototype communicates structure and
  flow. Final magitech theming is applied at implementation time using the
  tokens defined in the Design Principles document.
- **Not interactive against real data.** All values shown are mocked.