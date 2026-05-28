---
layout: week
title: Activity Diagrams
week_number: 6
hide_week_nav: true
permalink: /weeks/week-06/deliverable.html
---

## Activity diagrams

The following activity diagrams capture the core Widgetry workflows.

1. **Authentication and onboarding flow** – user sign-up, email verification,
   and first board creation.
2. **Polling scheduler and worker flow** – how scheduled widget polling jobs are
   queued, executed, and recorded.
3. **Widget polling and fetch validation** – external API fetch, JSON parsing,
   and error handling.
4. **Widget movement and layout save flow** – client drag/resizing, overlap checks,
   and optimistic persistence.

### Rendered diagrams

<details>
  <summary>Authentication and onboarding activity diagram</summary>
  <figure class="figure">
    <img src="{{ '/assets/img/activity-diagrams/act_auth.svg' | relative_url }}" alt="Authentication and onboarding activity diagram">
    <figcaption>Authentication and onboarding activity diagram.</figcaption>
  </figure>
</details>

<details>
  <summary>Polling scheduler and worker flow activity diagram</summary>
  <figure class="figure">
    <img src="{{ '/assets/img/activity-diagrams/act_poll_server.svg' | relative_url }}" alt="Polling scheduler and worker flow activity diagram">
    <figcaption>Polling scheduler and worker flow activity diagram.</figcaption>
  </figure>
</details>

<details>
  <summary>Widget polling and fetch validation activity diagram</summary>
  <figure class="figure">
    <img src="{{ '/assets/img/activity-diagrams/act_poll_widget.svg' | relative_url }}" alt="Widget polling and fetch validation activity diagram">
    <figcaption>Widget polling and fetch validation activity diagram.</figcaption>
  </figure>
</details>

<details>
  <summary>Widget movement and layout save activity diagram</summary>
  <figure class="figure">
    <img src="{{ '/assets/img/activity-diagrams/act_widget_move.svg' | relative_url }}" alt="Widget movement and layout save activity diagram">
    <figcaption>Widget movement and layout save activity diagram.</figcaption>
  </figure>
</details>
