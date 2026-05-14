---
title: "Week 6 - Class Diagrams"
week_number: 6
summary: UML class diagrams covering domain structure and behavior - complementary to the ERD, not a restatement of it.
permalink: /weeks/week-06/
---

The class diagrams capture the application's domain model and the relationships
between its core entities - behavior and structure rather than persistence
shape. They complement the ERD from week 4 rather than restating it; class
structure and table structure are not one-to-one mappings, especially for the
widget registry where one `widgets` row can map to any of seven concrete widget
classes depending on `widget_type`.

Three diagram sets are included: the domain model overview, the widget type
hierarchy (the registry pattern from the engineering doc), and the polling
subsystem (scheduler, worker, per-type fetchers, snapshot writer).

Controllers, route handlers, and framework boilerplate are deliberately not
modeled - they are framework-dictated and don't benefit from UML representation.