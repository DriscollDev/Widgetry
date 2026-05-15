---
layout: week
title: Heuristic Evaluation
week_number: 7
hide_week_nav: true
permalink: /weeks/week-07/deliverable.html
---

A heuristic evaluation of the Widgetry design against Nielsen's 10 usability
heuristics. Each heuristic is rated, with specific findings tied to the design
artifacts produced earlier in the planning phase (screen inventory, wireframes,
user flow diagrams, prototype). Severity ratings follow Nielsen's standard 0–4
scale: 0 = not a problem (strength), 1 = cosmetic, 2 = minor, 3 = major,
4 = catastrophic.

## Evaluation summary

| # | Heuristic | Status | Findings |
|---|-----------|--------|----------|
| 1 | Visibility of system status | Satisfied | 1 |
| 2 | Match between system and real world | Satisfied | 1 |
| 3 | User control and freedom | Satisfied | 1 |
| 4 | Consistency and standards | Satisfied | 1 |
| 5 | Error prevention | Fix In Progress | 2 |
| 6 | Recognition rather than recall | Satisfied | 1 |
| 7 | Flexibility and efficiency of use | Satisfied | 1 |
| 8 | Aesthetic and minimalist design | Satisfied | 1 |
| 9 | Help users recognize, diagnose, and recover from errors | Satisfied | 1 |
| 10 | Help and documentation | Satisfied | 1 |

## Methodology

The team reviewed each of Nielsen's ten heuristics against the planning
artifacts produced earlier in the phase - the screen inventory, wireframes,
user flow diagrams, and prototype. For each heuristic, the team identified how
the current design satisfies the principle, drawing on specific design
decisions made during planning.

The artifacts reviewed cover the must-have user flows from the feature
specification:

- Account creation, sign-in, and email verification
- Board creation, renaming, and deletion
- Widget addition, placement, resizing, and configuration
- Custom widget setup including credential entry
- Manual refresh and history viewing

This evaluation reflects the design as planned. A follow-up evaluation against
the implemented product is planned for late in the development phase, once
real screens exist to be walked through, and is expected to surface findings
that flow into the development backlog.

## Findings by heuristic

### 1. Visibility of system status

**Status:** Satisfied

**Findings:**

- **F1.1** Each screen carries a clear title and layout, providing users with
  continuous awareness of where they are in the app and the state of any
  in-progress action. *Severity:* 0 (strength). *Recommendation:* maintain
  this convention across screens added during development.

### 2. Match between system and the real world

**Status:** Satisfied

**Findings:**

- **F2.1** Pages follow standard, universally accepted patterns for actions
  such as sign-in, with sidebar navigation matching user expectations from
  conventional web applications. *Severity:* 0 (strength). *Recommendation:*
  maintain.

### 3. User control and freedom

**Status:** Satisfied

**Findings:**

- **F3.1** All actions on widgets can be reversed or amended. Users can remove
  any widget they no longer want and update existing widgets to change their
  configuration or position. *Severity:* 0 (strength). *Recommendation:*
  maintain - extend the same affordance to any new widget-level operations
  introduced during development.

### 4. Consistency and standards

**Status:** Satisfied

**Findings:**

- **F4.1** Each page follows a consistent layout and theme. Navigation stays
  on the left side, the main content area is organized by settings, and the
  dashboard layout is consistent across boards. *Severity:* 0 (strength).
  *Recommendation:* maintain.

### 5. Error prevention

**Status:** Fix In Progress

**Findings:**

- **F5.1** Required form fields must be filled before submission. Each modal
  and widget has scoped functionality - nothing tries to handle data or
  actions it is not designed for, reducing the surface area where user error
  can occur. *Severity:* 0 (strength). *Recommendation:* maintain; carry the
  same scoping discipline into new modals and widgets.

### 6. Recognition rather than recall

**Status:** Satisfied

**Findings:**

- **F6.1** The entry point is a sign-in/sign-up page. From there, a navigation
  panel on the left exposes the major sections of the app: settings,
  dashboards, FAQ, and notifications. Users do not need to remember commands
  or paths. *Severity:* 0 (strength). *Recommendation:* maintain.

### 7. Flexibility and efficiency of use

**Status:** Satisfied

**Findings:**

- **F7.1** The system has a clear structure with familiar layouts for all
  major flows. An FAQ section explains how to use the site and walks through
  specific features for users who need that support. *Severity:* 0
  (strength). *Recommendation:* maintain.

### 8. Aesthetic and minimalist design

**Status:** Satisfied

**Findings:**

- **F8.1** Minimalism is the core idea of the site. Widgets use simple but
  effective templates; page navigation is easy to use; dashboards can be
  organized into themes; secondary pages are easy to reach and operate.
  *Severity:* 0 (strength). *Recommendation:* maintain - resist scope creep
  in widget chrome and modal density during development.

### 9. Help users recognize, diagnose, and recover from errors

**Status:** Satisfied

**Findings:**

- **F9.1** Errors surface via two mechanisms: a reusable error modal that
  displays the relevant message when something goes wrong, and a per-widget
  down-state display plus notification when a widget cannot connect to its
  API. *Severity:* 0 (strength). *Recommendation:* maintain.

### 10. Help and documentation

**Status:** Satisfied

**Findings:**

- **F10.1** Help is available in two places: the project's GitHub wiki and
  the in-app FAQ. Together these cover the common problems users are likely
  to encounter and how to resolve them. *Severity:* 0 (strength).
  *Recommendation:* maintain - keep the wiki and FAQ in sync as the product
  evolves during development.

## Priority fixes

No findings rated severity 3 or higher were identified in this evaluation
round. As actual screens are built during the development phase, a follow-up
evaluation will identify findings that feed into the sprint backlog.

## Findings deferred to phase 2

No findings deferred at this stage.