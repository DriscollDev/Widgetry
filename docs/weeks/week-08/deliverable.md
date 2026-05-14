---
layout: week
title: Gantt Chart
week_number: 8
hide_week_nav: true
permalink: /weeks/week-08/deliverable.html
---

Sprint-by-sprint plan rendered as a Gantt chart. The image below is rendered from
the Mermaid source kept underneath; rebuild the image when the source changes.

<!--
  Workflow:
  1. Author/edit the chart in assets/gantt/schedule.mmd (Mermaid source).
  2. Render to SVG via the Mermaid CLI:
       mmdc -i assets/gantt/schedule.mmd -o assets/img/gantt.svg
  3. Commit both files.
  Keep the source visible in the <details> block so reviewers can read it as text.
-->

<figure class="figure">
  <img src="{{ '/assets/img/gantt.svg' | relative_url }}" alt="Widgetry development Gantt chart">
  <figcaption>Ten-week development plan, sprint-by-sprint.</figcaption>
</figure>

<details>
  <summary>Mermaid source</summary>
  <pre><code>gantt
  title Widgetry Development Schedule
  dateFormat YYYY-MM-DD
  axisFormat %b %d

  section Sprint 1 — Foundation
  Monorepo scaffolding   :s1a, 2026-W1, 4d
  Better-Auth integration:s1b, after s1a, 5d
  Board CRUD             :s1c, after s1b, 3d

  section Sprint 2 — Widgets & Layout
  Grid library spike     :s2a, 2026-W3, 2d
  Snapshot pipeline      :s2b, after s2a, 4d
  First three widgets    :s2c, after s2b, 6d

  (continue per Engineering Doc §19)
</code></pre>
</details>

## Notes

- Sprint plan and ownership are mirrored from the engineering document. Updating
  one without the other creates drift; keep them in sync at sprint boundaries.
- Critical-path items: grid layout, auth integration, scheduler. Slip on any of
  these compresses Sprint 5 (testing and demo prep).
