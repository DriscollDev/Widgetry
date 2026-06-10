---
title: Risks and How We're Managing Them
permalink: /design/planning-risks/
---

Every project has things that could go wrong. Pretending they won't is the most reliable way to be caught off guard. We made a list of the realistic risks during planning, and for each one, we wrote down what we'd do if it happened - or better, what we'd do *now* to make it less likely.

## Scope is too large for the timeline

**The risk.** Three developers, ten weeks of building, and a substantial feature list. There's a real chance we won't finish everything we'd like to.

**Why we think it's likely.** Capstone projects routinely run over. We're not the first team to underestimate how long things take.

**What we're doing.** Tiering features into must-have, should-have, and nice-to-have, with the explicit understanding that we cut from the bottom if pace slips. (See [Key Decisions](/design/planning-key-decisions/).) Reviewing scope every two weeks at the end of each sprint. Hard feature freeze at the end of week eight, regardless of where we are.

## The drag-and-resize grid turns out to be hard

**The risk.** A grid layout where users smoothly drag and resize widgets - without overlaps and with the changes saved - is the kind of feature that *looks* simple and proves trickier than expected. There are a number of edge cases (touch versus mouse, what happens during the drag itself, how the layout responds to window resizing) that can each consume days.

**What we're doing.** First two weeks of building include a focused exploration of this exact feature. We'll try an existing software library that handles grid layouts and decide quickly whether it fits our needs. If it does, great. If not, we have a backup plan to build our own - and we've estimated how long that would take, so we know what we're getting into.

## A library we're depending on turns out to be a poor fit

**The risk.** Modern software is built by combining many existing libraries. Most are excellent. Some, when you actually try to use them, turn out to have rough edges, missing features, or maintenance problems that aren't visible from the outside.

**What we're doing.** For each significant library choice, we've identified a fallback. If our authentication library doesn't integrate cleanly with our backend framework, we have a plan for what to do instead. If our database tools prove painful, we have a fallback to a simpler approach. Spending half a day on these contingencies up front is much cheaper than discovering the problem in week six with no plan.

## Rate limits or shutdowns of free external APIs

**The risk.** Several of our widgets pull data from external services - weather, stocks, currency exchange. We're using their free tiers. Free tiers sometimes change, get more restrictive, or disappear.

**What we're doing.** We've identified backup providers for each category, so if our first choice for stocks stops working, we know which alternative to switch to. We're also caching responses on our server, which means a rate limit on the external service doesn't immediately translate into broken widgets - we can serve a slightly-old value rather than an error.

## The custom widget gets used to attack other systems

**The risk.** The custom widget lets users tell our server to fetch URLs of their choice. If we don't carefully restrict where those requests can go, a malicious user could potentially use our server to access systems they shouldn't be able to reach. This is a real, named class of vulnerability called SSRF (server-side request forgery), and it has caused major real-world breaches.

**What we're doing.** Multiple layers of protection - we walk through them on the [Keeping Your Data Safe](/design/how-it-works-keeping-data-safe/) page. We've also built a dedicated test suite that tries to abuse the widget in known-bad ways, and that test suite runs every time we change the code. Toward the end of the project, we'll do a self-review against the OWASP Top 10 - a widely-used checklist of the most common security mistakes - to catch anything we missed.

## A team member becomes unavailable

**The risk.** With a three-person team, losing one person for even a week is significant. People get sick, have family emergencies, or get overwhelmed by other classes.

**What we're doing.** Every part of the system has a primary owner *and* a secondary owner. The secondary reviews the primary's work and is positioned to take over if needed. No one person is the only one who understands any part of the system. We also do code review on every change, which has the side effect of spreading knowledge naturally.

## A bad change makes it to the live system

**The risk.** Most software bugs are minor and easy to fix. A few - especially ones involving the database - can be much harder to recover from, particularly if we make a change that's easy to apply but hard to undo.

**What we're doing.** Every change goes through a review by another team member before it's deployed. We've also written down a specific policy for database changes: they're forward-only, meaning we don't try to "undo" a database change by going backward. Instead, if a database change causes problems, we make a *new* change that fixes the problem. This prevents a whole category of subtle issues that arise when old code runs against a newer database.

## The schedule slips because testing is left until the end

**The risk.** This is a classic pattern: build everything, then realize in the last week that none of it works together properly, and there's no time to fix it.

**What we're doing.** Tests are part of the work, not a separate phase. Every change includes the tests that go with it. The full test suite runs automatically on every proposed change, so a change that breaks something else is flagged immediately. The final two weeks are explicitly reserved for testing, polish, and documentation - and *only* those things - so even if our pace is excellent, those weeks are protected.

## A note on this list

A common temptation is to write a risk register, file it away, and never look at it again. We've tried to avoid that by tying each risk to a concrete thing we're doing. The point isn't to predict the future; it's to have already done the thinking when something does go wrong.
