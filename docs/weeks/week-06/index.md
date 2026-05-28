---
title: "Week 6 - Activity Diagrams"
week_number: 6
summary: Activity diagrams showing the core user and system flows through the Widgetry application.
permalink: /weeks/week-06/
---

Activity diagrams describe how users and the system interact across the
application's key workflows. They show the sequence of actions, decision
points, and handoffs between actors and system components for features such as
board creation, widget setup, API polling, and alert handling.

The diagrams focus on the primary usage scenarios rather than UI layout,
making them the ideal planning artifact for the app's behavior and conditional
flows.

Three diagram sets are included: the domain model overview, the widget type
hierarchy (the registry pattern from the engineering doc), and the polling
subsystem (scheduler, worker, per-type fetchers, snapshot writer).

Controllers, route handlers, and framework boilerplate are deliberately not
modeled - they are framework-dictated and don't benefit from UML representation.