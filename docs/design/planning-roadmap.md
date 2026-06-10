---
title: The Roadmap
permalink: /design/planning-roadmap/
---

The build phase is split into five two-week sprints. Each sprint has a goal and a clear "what should be working at the end" statement. This page is the roadmap; we'll mark off each milestone as we hit it.

The plan is detailed but not rigid. Every week will we pause, look at how the previous sprint went, and adjust if needed.

## Sprints 1–2: Foundation

**Goal:** Build the skeleton. Get all the pieces of the system talking to each other, even if they don't do much yet.

**By the end of this sprint, you should be able to:** Sign up, log in, create a board, and see an empty grid where widgets will eventually go.

**What's happening behind the scenes:** Setting up the project structure, getting our hosting platform configured, building the basics of the user account system, and doing a focused exploration of the drag-and-resize grid layout (the riskiest piece of the user interface).

## Sprints 3–4: The first widgets

**Goal:** Get the core widget experience working end-to-end with a small starting catalog.

**By the end of this sprint, you should be able to:** Place a clock widget, a weather widget, and an uptime widget on a board. Drag them around and resize them. The uptime widget should actually be checking the URL you gave it on a schedule, and you should see the most recent result.

**What's happening behind the scenes:** Building the widget configuration interface, getting the background worker running, building the system that stores historical data points, and shipping the three widget types that prove out the three different ways widgets work (purely local, fetched in the browser, fetched on the server).

## Sprints 5–6: Authentication completion and the custom widget

**Goal:** Finish the account system and ship the most flexible feature in the product.

**By the end of this sprint, you should be able to:** Verify your email, reset a forgotten password, and sign in with Google. You should also be able to create a custom widget - pointing at any public data source on the internet, with or without an API key - and have it display the value you specified.

**What's happening behind the scenes:** Integrating with our email provider for the verification and reset flows. Building the custom widget end-to-end, which is the largest single piece of work in the project: it includes the configuration interface, the data-fetching logic, the security protections we've described elsewhere, the language for specifying which value to extract, and the encrypted storage for API keys.

## Sprints 7–8: The remaining widgets and polish

**Goal:** Round out the widget catalog and add the features that make the product feel complete.

**By the end of this sprint:** All seven widget types are available. Widgets that store history can be expanded to show a timeline chart. You can manually refresh a widget on demand. You can configure how long historical data is kept. The product should feel finished from a user's perspective.

**This is the feature freeze point.** After week 8, no new features are added. The remaining time is for testing, fixing, and polishing.

## Sprint 5s 9–10: Testing, documentation, and demo

**Goal:** Make sure what we built is solid, and prepare to present it.

**By the end of this sprint:** Test coverage meets our targets. The security test suite covering the custom widget protections is comprehensive. The user guide is written and includes screenshots. The deployment runbook is complete and has been verified by doing a fresh deployment from scratch. The capstone demo has been rehearsed.

**What's *not* happening:** New features. This is a hard rule. The temptation to slip in "one more thing" at the end is what kills projects.

## Looking past the capstone

The capstone deliverable is the must-have feature set described above. If the project lives past graduation - which we'd like - there's a long list of things that would make it better. Most of them appear elsewhere in this wiki under the heading of "things we deliberately didn't do this time." Notifications and alerting. Sharing boards with other people. Mobile-friendly layouts. Real-time updates instead of polling. A widget marketplace.

For now, those are notes for a future version. The plan above is what we've committed to.
