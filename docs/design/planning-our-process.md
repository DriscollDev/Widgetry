---
title: Our Process
permalink: /design/planning-our-process/
---

This page describes how the team approached planning the project. It's the first page in the section dedicated to *how we worked*, as distinct from *what we built*.

## Why we did so much planning

The capstone is twenty weeks long. We spent the first ten on planning and design - half the entire project. To anyone who has only worked on assignments due in a week, that probably sounds like overkill. There are a few reasons we made that choice.

**Three people working in parallel can lose more time to confusion than they gain to parallelism.** If we hadn't agreed in advance on what a "widget" is, what the database tables look like, or how widgets fetch their data, we'd have spent the build phase constantly stopping to renegotiate those things. That kind of friction is invisible - it doesn't show up as missed deadlines, it shows up as everything taking longer than expected and nobody being sure why.

**The problem we're solving has more depth than it first appears.** "Build a dashboard with widgets" sounds simple. Once you start asking "what about authentication, what about historical data, what about security on user-supplied URLs, what happens when a widget fails," the questions multiply quickly. Better to discover those during planning than during week eight.

**We're being graded on process as well as product.** The capstone is meant to demonstrate that we can run a real software project, not just write code. Producing the planning artifacts is part of the deliverable.

## What we produced

The planning phase produced four main documents, each with a specific purpose.

The **project proposal** was the first thing. Loose, brainstormy, not very rigorous - basically "here's what we want to do and why." It existed to align the three of us on a direction and to get sign-off from our advisor.

The **feature specification** is the description of *what* we're building, written from the user's point of view. It defines the personas, lists the user stories, sets concrete requirements (a board can have at most 20 widgets, password reset tokens expire after one hour, and so on), and - importantly - lists what we're *not* going to build. We went through several rounds of review on this one and locked it at a specific version. After it was locked, scope changes required a formal revision rather than a casual conversation.

The **engineering document** is the description of *how* we'll build it, written from the developer's point of view. It defines the architecture, the database structure, the way different components communicate, the security model, and the sprint plan. Like the spec, it went through review rounds and was eventually ratified.

The **diagrams** - an entity-relationship diagram showing the database structure, and activity diagrams showing how key processes flow - sit alongside the engineering document and visualize parts of it.

This wiki is the fifth artifact. It exists to make all of the above accessible to people who aren't on the team.

## How we made decisions

Most of the planning time was spent making decisions. Some were small ("which library should we use for charts"); some were structural ("should the website and the API be one program or two"). The pattern we tried to follow for any non-trivial decision was:

1. **Identify alternatives.** What are the realistic options? If we can only think of one, we probably haven't thought hard enough.
2. **Identify the trade-offs.** Each option is good at something and bad at something else. What are those?
3. **Pick one and write down why.** Not just *what* we picked, but *why we picked it over the alternatives we considered*. The "why" is more valuable than the "what" - it's what lets future-us (or a reviewer) evaluate whether the reasoning still holds.

We collected the most consequential decisions on the [Key Decisions](/design/planning-key-decisions/) page.

## How we managed risk

Software projects fail in predictable ways. Things take longer than expected. A library that looked promising turns out to have problems. A team member gets sick at a critical moment. We tried to anticipate these and write down what we'd do about each one. The list lives on the [Risks](/design/planning-risks/) page.

The single most important risk-management tool we have is **scope tiering**. We sorted every feature into "must-have," "should-have," and "nice-to-have." If we're behind schedule near the end, the should-haves get cut, then the nice-to-haves. We won't ship a half-built must-have feature; we'll ship the must-haves polished and skip the should-haves entirely. This is a much better outcome than half-finishing everything.

## How we'll work during the build phase

The build phase is split into five two-week sprints. Each sprint has a defined goal and exit criteria - a short statement of "what should be working at the end of these two weeks." At the end of each sprint, we'll do a brief retrospective: what went well, what didn't, what we'll do differently next time.

The last sprint is reserved for testing, polish, documentation, and demo preparation. **No new features after the end of week eight.** This is the kind of rule that's easy to write down and hard to enforce, but it has a track record of being the difference between projects that ship and projects that don't.

Read the [Roadmap](/design/planning-roadmap/) for the sprint-by-sprint plan.
