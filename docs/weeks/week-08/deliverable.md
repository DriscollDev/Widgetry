---
layout: week
title: Heuristic Evaluation
week_number: 8
hide_week_nav: true
permalink: /weeks/week-08/deliverable.html
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
| 1 | Visibility of system status | Fixed | 2 |
| 2 | Match between system and real world | Satisfied | 1 |
| 3 | User control and freedom | Fixed | 2 |
| 4 | Consistency and standards | Satisfied | 1 |
| 5 | Error prevention | Fix In Progress | 3 |
| 6 | Recognition rather than recall | Satisfied | 1 |
| 7 | Flexibility and efficiency of use | Satisfied | 1 |
| 8 | Aesthetic and minimalist design | Fixed | 2 |
| 9 | Help users recognize, diagnose, and recover from errors | Satisfied | 1 |
| 10 | Help and documentation | Fixed | 3 |

## Methodology

The team reviewed each of Nielsen's ten heuristics against the planning
artifacts produced earlier in the phase - the screen inventory, wireframes,
user flow diagrams, and prototype. For each heuristic, the team identified how
the current design satisfies the principle, drawing on specific design
decisions made during planning. Issues surfaced during this review were
addressed by amending the design before this document was finalized; fixes are
recorded inline with the findings that prompted them.

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

**Status:** Fixed

**Findings:**

- **F1.1** Each screen carries a clear title and layout, providing users with
  continuous awareness of where they are in the app and the state of any
  in-progress action. *Severity:* 0 (strength). *Recommendation:* maintain
  this convention across screens added during development.

- **F1.2** Widgets did not display a "last checked" timestamp, so a stale
  reading appeared identical to a live one - users had no way to tell when
  the data they were looking at was last refreshed. *Severity:* 3 (major).
  *Recommendation:* added a timestamp and a pulsing status dot to each
  widget. **Fix applied.**

### 2. Match between system and the real world

**Status:** Satisfied

**Findings:**

- **F2.1** Pages follow standard, universally accepted patterns for actions
  such as sign-in, with sidebar navigation matching user expectations from
  conventional web applications. *Severity:* 0 (strength). *Recommendation:*
  maintain.

### 3. User control and freedom

**Status:** Fixed

**Findings:**

- **F3.1** All actions on widgets can be reversed or amended. Users can remove
  any widget they no longer want and update existing widgets to change their
  configuration or position. *Severity:* 0 (strength). *Recommendation:*
  maintain - extend the same affordance to any new widget-level operations
  introduced during development.

- **F3.2** Deleting a widget had no undo path - once confirmed, the widget
  was immediately gone with no recovery short of recreating it from
  scratch. *Severity:* 3 (major). *Recommendation:* added a 5-second undo
  toast that delays final removal, letting users recover from accidental
  deletes. **Fix applied.**

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

- **F5.2** No dedicated error page existed for the user - errors from
  unknown routes, expired sessions, or unexpected failures had no surface
  to appear on. *Severity:* 3 (major). *Recommendation:* added a dedicated
  error page to the design. **Fix applied.**

- **F5.3** Inline error messaging for action-level errors (form submission
  failures, validation issues caught after submit) had no consistent UI
  pattern. *Severity:* 3 (major). *Recommendation:* added a pop-up message
  pattern for error feedback. **Fix in progress** - visual design complete;
  integration into all relevant forms pending.

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

**Status:** Fixed

**Findings:**

- **F8.1** Minimalism is the core idea of the site. Widgets use simple but
  effective templates; page navigation is easy to use; dashboards can be
  organized into themes; secondary pages are easy to reach and operate.
  *Severity:* 0 (strength). *Recommendation:* maintain - resist scope creep
  in widget chrome and modal density during development.

- **F8.2** Early iterations of the board view felt visually dense, with
  widgets sitting too close to each other and to the page margins.
  *Severity:* 2 (minor). *Recommendation:* established a 24px snap grid
  with 16px inter-widget gutters as the layout standard, giving widgets
  breathing room without losing density. **Fix applied.**

### 9. Help users recognize, diagnose, and recover from errors

**Status:** Satisfied

**Findings:**

- **F9.1** Errors surface via two mechanisms: a reusable error modal that
  displays the relevant message when something goes wrong, and a per-widget
  down-state display plus notification when a widget cannot connect to its
  API. *Severity:* 0 (strength). *Recommendation:* maintain.

### 10. Help and documentation

**Status:** Fixed

**Findings:**

- **F10.1** Help is available in two places: the project's GitHub wiki and
  the in-app FAQ. Together these cover the common problems users are likely
  to encounter and how to resolve them. *Severity:* 0 (strength).
  *Recommendation:* maintain - keep the wiki and FAQ in sync as the product
  evolves during development.

- **F10.2** No FAQ page existed in the design despite earlier sections of
  this evaluation referring to one. *Severity:* 2 (minor).
  *Recommendation:* added a dedicated FAQ page to the screen inventory and
  prototype. **Fix applied.**

- **F10.3** No in-app Help page existed for users who needed more than the
  FAQ - anyone needing detailed documentation had to leave the app for the
  GitHub wiki. *Severity:* 2 (minor). *Recommendation:* added a dedicated
  Help page to the design. **Fix applied.**

## Priority fixes

Six findings rated severity 2 or higher were identified during this evaluation
round. Five have been resolved through design amendments (F1.2, F3.2, F5.2,
F8.2, F10.2, F10.3); one remains in progress (F5.3, the inline error pop-up
pattern) and is on track to complete before the planning phase concludes.

A follow-up evaluation against the implemented product is planned for late in
the development phase, once real screens exist to be walked through, and is
expected to surface findings that feed into the sprint backlog.

## Findings deferred to phase 2

No findings deferred at this stage.