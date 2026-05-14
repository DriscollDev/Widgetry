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

<figure class="figure">
  <img src="{{ '/assets/img/use-case-diagram.svg' | relative_url }}" alt="Widgetry use case diagram showing actors and their use cases">
  <figcaption>Use case diagram for Widgetry. Actors on the perimeter, use cases inside the system boundary.</figcaption>
</figure>

## Actors

- **Registered User** - primary actor; signed in to the system. Owns boards and
  widgets. Initiates the vast majority of system interactions.
- **Visitor** - unauthenticated. Can sign up, sign in, request password reset,
  and verify their email via tokenized link.
- **Scheduler (system actor)** - internal cron-driven actor; not a person.
  Drives the polling loop that fetches data from external APIs.
- **External API (system actor)** - third-party data sources (weather, stocks,
  uptime targets, user-supplied JSON endpoints).

## Use case summaries

TODO: list each use case in the diagram with a one-line description. Grouped by
actor or by epic.

- **Account management** (Visitor → Registered User): sign up, sign in,
  verify email, reset password, sign out, delete account.
- **Board management** (Registered User): create, rename, delete, configure
  refresh mode, manually refresh.
- **Widget management** (Registered User): add from catalog, configure, move,
  resize, delete, view history.
- **Credential management** (Registered User): submit, replace, delete API key
  for a custom widget.
- **Scheduled polling** (Scheduler → External API): dequeue due widgets, poll
  upstream APIs, store snapshots.

## Notes

- "Visitor" and "Registered User" are the same person at different stages of the
  session - the diagram models them as distinct actors because their authority
  and available actions are entirely different.
- System actors (Scheduler, External API) are included because they participate
  in use cases that user actors initiate or depend on, even though they are not
  people.