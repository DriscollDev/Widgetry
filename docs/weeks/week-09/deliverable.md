---
layout: week
title: Gantt Chart
week_number: 9
hide_week_nav: true
permalink: /weeks/week-09/deliverable.html
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
  <img src="{{ '/assets/img/gantt.svg' | relative_url }}" alt="Widgetry Planning Gantt chart">
  <figcaption>Ten-week Planning plan, week-by-week.</figcaption>
</figure>
<figure class="figure">
  <img src="{{ '/assets/img/devgantt.svg' | relative_url }}" alt="Widgetry development Gantt chart">
  <figcaption>Ten-week Development plan, week-by-week.</figcaption>
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
<details>
  <summary>Mermaid source - Dev</summary>
  <pre><code>
  mermaid
  gantt
    title Widgetry — MVP Epic-Level Gantt (10 weeks, 3 devs)
    dateFormat YYYY-MM-DD
    axisFormat %b %d
    tickInterval 1week
    weekday monday
 
    section Sprint 1 · Foundation (W1-2)
    E1 Platform Foundation            :crit, e1,  2026-06-01, 14d
    E2a Core auth (email+pw)          :e2a,       2026-06-01, 14d
    E3 Boards & Grid (start)          :crit, e3,  2026-06-08, 21d
    M1 Sprint 1 exit                  :milestone, m1, 2026-06-14, 0d
 
    section Sprint 2 · First widgets + layout (W3-4)
    E4 Widget Framework               :crit, e4,  2026-06-15, 14d
    E7 Polling Infrastructure         :crit, e7,  2026-06-15, 14d
    E5a Clock / Weather / Uptime      :e5a,       2026-06-15, 14d
    M2 Sprint 2 exit                  :milestone, m2, 2026-06-28, 0d
 
    section Sprint 3 · Auth completion + custom widget (W5-6)
    E2b Verify / reset / OAuth / del  :e2b,       2026-06-29, 14d
    E6 Custom JSON Widget             :crit, e6,  2026-06-29, 14d
    E9 Credentials + hardening        :e9,        2026-06-29, 28d
    M3 Sprint 3 exit                  :milestone, m3, 2026-07-12, 0d
 
    section Sprint 4 · Polish + remaining widgets (W7-8)
    E5b Stock / Currency / Date-Time  :e5b,       2026-07-13, 14d
    E8 History / Retention / Timeline :crit, e8,  2026-07-13, 14d
    M4 FEATURE FREEZE                 :milestone, m4, 2026-07-26, 0d
 
    section Sprint 5 · Testing, docs, demo (W9-10)
    E10 Quality / Docs / Demo         :crit, e10, 2026-07-27, 14d
    M5 Capstone defense ready         :milestone, m5, 2026-08-09, 0d
</code></pre>
</details>