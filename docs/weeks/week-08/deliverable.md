---
layout: week
title: Gantt Chart
week_number: 8
hide_week_nav: true
permalink: /weeks/week-08/deliverable.html
---

Phase based plan rendered as a Gantt chart. The image below is rendered from
the Mermaid source kept underneath; rebuild the image when the source changes.

<!--
  Workflow:
  1. Author/edit the chart in assets/gantt/schedule.mmd (Mermaid source).
  2. Render to SVG via the Mermaid CLI:
       mmdc -i assets/mermaid/schedule.mmd -o assets/img/gantt.svg
  3. Commit both files.
  Keep the source visible in the <details> block so reviewers can read it as text.
-->

<figure class="figure">
  <img src="{{ '/assets/img/gantt.svg' | relative_url }}" alt="Widgetry development Gantt chart">
  <figcaption>Ten-week development plan, sprint-by-sprint.</figcaption>
</figure>

<details>
  <summary>Mermaid source</summary>
  <pre><code>---
config:
  gantt:
    leftPadding: 200
---
gantt
    title 10-Week Project Planning Timeline
    dateFormat YYYY-MM-DD
    axisFormat %m/%d
    excludes weekends
    todayMarker off

    section Phase 1: Planning & Proposal
    Define Project Scope                     :a1, 2026-03-23, 5d
    Identify Target Users                    :a2, 2026-03-23, 5d
    Draft Project Proposal                   :a3, 2026-03-23, 5d
    Submit Proposal                          :milestone, m1, 2026-03-27, 0d

    section Phase 2: Setup & Architecture
    Define Technology Stack                  :b1, 2026-03-30, 10d
    Create Use Case Diagram                  :b2, 2026-03-30, 5d
    Design Database Schema                   :b3, 2026-03-30, 10d
    Prototype Wireframe                      :b4, 2026-04-13, 5d
    Design Completion                        :milestone, m2, 2026-04-17, 0d

    section Phase 3: Documentation & Design
    Midterm Presentation                     :c1, 2026-04-20, 1d
    Start Project Wiki                       :c2, 2026-04-20, 10d
    Activity Diagrams                        :c3, 2026-04-27, 5d
    Class Diagrams                           :c4, 2026-05-04, 5d
    Heuristic Evaluation                     :c5, 2026-05-11, 5d
    Project Identity Finalized               :milestone, m3, 2026-05-15, 0d

    section Phase 4: Planning for Development
    Define Detailed User Stories & Features  :d1, 2026-04-27, 10d
    API Design Spec                          :d2, 2026-05-04, 10d
    Sprint Planning for Development          :d3, 2026-05-11, 10d
    Planning & Design Completion             :milestone, m4, 2026-05-22, 0d

    section Phase 5: Final Deliverables
    Dev Timeline Chart                       :e1, 2026-05-18, 5d
    Finalize and Publish Wiki                :e2, 2026-05-18, 10d
    Final Presentation                       :milestone, m5, 2026-05-29, 0d
</code></pre>
</details>
