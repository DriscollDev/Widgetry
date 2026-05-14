---
title: "Week 2 - Use Case Diagram"
week_number: 2
summary: Actors on the perimeter, use cases inside the system boundary - a structured view of what the system is for.
permalink: /weeks/week-02/
---

The use case diagram translates the proposal's narrative of "who uses this and
what for" into a structured view: actors on the perimeter, use cases inside the
system boundary, lines showing which actors initiate which interactions. It sits
between the proposal and the database design by clarifying behavior - what the
system is for - before either the persistence shape or the class structure are
locked in.

Notes worth flagging:

- The diagram models four actors: Registered User, Visitor (the same person
  pre-authentication), and two system actors - the Scheduler and External APIs
  - that participate in use cases even though they are not people.
- Visitor and Registered User are kept as distinct actors because their
  authority and available actions are entirely different; collapsing them would
  obscure access boundaries that matter elsewhere in the design.