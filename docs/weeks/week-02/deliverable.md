---
layout: week
title: Use Case Diagram
week_number: 2
hide_week_nav: true
permalink: /weeks/week-02/deliverable.html
---

The use case diagram for Widgetry, capturing the actors who interact with the
system and the goals they pursue. Generated from the team's modeling tool and
exported as SVG for crisp display at any zoom level.

<!--
  Export the use case diagram as SVG (preferred) or PNG.
  Save as /assets/img/use-case-diagram.svg and commit.
  SVG is preferred because it scales without blurring.
-->
<Details>
  <Summary>Authentication & Account Management</Summary>
  <figure class="figure">
    <img src="{{ '/assets/img/AuthUML.svg' | relative_url }}" alt="Widgetry use case diagram showing actors and their use cases" style="background: var(--ink-3); border-radius: var(--radius-m);">
    <figcaption>Use case diagram for Widgetry. Actors on the perimeter, use cases inside the system boundary.</figcaption>
  </figure>
</Details>
<Details>
  <Summary>Board & Widget Lifecycle</Summary>
  <figure class="figure">
    <img src="{{ '/assets/img/BoardUML.svg' | relative_url }}" alt="Widgetry use case diagram showing actors and their use cases" style="background: var(--ink-3); border-radius: var(--radius-m);">
    <figcaption>Use case diagram for Widgetry. Actors on the perimeter, use cases inside the system boundary.</figcaption>
  </figure>
</Details>
<Details>
  <Summary>Data & Credentials</Summary>
  <figure class="figure">
    <img src="{{ '/assets/img/CredsUML.svg' | relative_url }}" alt="Widgetry use case diagram showing actors and their use cases" style="background: var(--ink-3); border-radius: var(--radius-m);">
    <figcaption>Use case diagram for Widgetry. Actors on the perimeter, use cases inside the system boundary.</figcaption>
  </figure>
</Details>





## Actors

- **Visitor** - A user without an authenticated session. Interacts only with auth-related use cases (sign up, sign in, verify email, request and complete password reset). Becomes an Authenticated User after a successful sign-in.
- **Authenticated User** - A user with an active session. The primary actor for nearly all functional use cases: managing boards, placing and configuring widgets, handling credentials, and viewing history. Owns all of their resources; there is no concept of shared or delegated access in MVP.
- **Google OAuth Provider (external)** - Third-party identity provider used for federated sign-up and sign-in (FR-1.3). Drawn outside the system boundary because it is not part of Widgetry.
- **Email Service / Resend (external)** - Third-party transactional email provider (FR-1.9). Receives send requests from the system for verification emails and password reset emails.
- **External API (external)** - Aggregate representation of all third-party HTTP endpoints the system fetches from: Open-Meteo (weather), the chosen stock data provider, the chosen currency provider, and any user-supplied URL fronted by a custom JSON widget. Modeled as one actor because they share the same role from the system's perspective.

## Use case summaries

TODO: list each use case in the diagram with a one-line description. Grouped by
actor or by epic.

- **Authentication & Account Management**: Covers every flow that brings a user into or out of the system: sign-up, sign-in, sign-out, email verification, password reset, and account deletion, with Google OAuth as an optional path extending both sign-up and sign-in. Two external actors participate - Google OAuth handles federated credentials, and Resend delivers the tokenized verification and reset emails.
- **Board & Widget Lifecycle**: Covers structural CRUD on boards (create, view, list, edit settings, delete, refresh all) and on widgets within a board (add from catalog, move, resize, delete), with a shared Validate Grid Position check included by every operation that places a widget on the grid. Overlap conflicts trigger the Reject and Snap Back extension on Move and Resize, which is the clearest <<extend>> relationship in the document
- **Widget Data & Credentials**: Covers the configuration of a widget (with Custom JSON extending the base case), credential lifecycle (submit, replace, delete with envelope encryption included on submit and replace), manual per-widget refresh, and viewing historical snapshots. The External API actor sits outside the boundary and connects via Fetch External Data, while SSRF and JSON-path validation are included sub-behaviors that gate any custom widget from being saved.
