---
title: What It Doesn't Do (Yet)
permalink: /design/what-it-doesnt-do/
---

A list of features the first version of our product won't have, and why we made that choice for each one. Listing what we're *not* building is just as important as listing what we are - it's how we keep the project achievable in the time we have, and it's how we avoid promising things we can't deliver.

Each item below is a reasonable feature that we considered and consciously deferred. None are off the table forever; they're off the table for *now*.

## No alerts or notifications

If a website you're monitoring goes down, we won't email you, text you, or push a notification to your phone. You'll see it the next time you open the dashboard.

**Why:** Reliable alerting is a project unto itself. Doing it well means handling email delivery, phone-number verification, do-not-disturb hours, and avoiding alert fatigue. We'd rather ship a great dashboard than a mediocre alerting system bolted onto one.

## No sharing boards with other people

Every board belongs to one person. You can't share a board with a teammate or make a public read-only link.

**Why:** Sharing introduces permissions, which introduce edge cases (what if someone you shared with is then removed?), which introduce a whole sub-feature we can't justify in version one.

## No mobile-optimized layout

The product targets desktop browsers. It will probably work on a tablet. It won't be a good experience on a phone.

**Why:** A phone-friendly layout means rearranging widgets to fit a narrow screen, which means designing how that rearrangement should work, which is a significant design problem. We'd rather have one polished desktop experience than two half-finished ones.

## No widgets that talk to each other

Widgets are display-only. You can't have one widget filter another, or feed the output of one into the input of another.

**Why:** This crosses the line from "dashboard" into "low-code automation tool." That's a different and much larger product.

## No marketplace for community-built widgets

Users can't write and share their own widget code. The catalog of widget *types* is set by us; users configure those types, but can't extend them.

**Why:** Letting users run code on our servers is a significant security and operational responsibility. The custom JSON widget gives users the flexibility to display almost any data without us ever running their code.

## No team or organization accounts

Every account is for one person. There's no concept of an organization with multiple users.

**Why:** Same reason as sharing - multi-user accounts add a tier of complexity (roles, billing, invitations) that doesn't fit the version-one scope.

## No board templates, import, or export

You can't start from a template, copy a board from someone else, or download your boards as a file.

**Why:** All of these are nice-to-haves. None of them are reasons someone would or wouldn't use the product on day one.

## No paid plans or service guarantees

The product is free during the capstone. We don't make any promises about uptime, data retention beyond what we've documented, or response times.

**Why:** It's a student project. Promising production-grade reliability would be dishonest.

## A note on this list

Documenting what we're *not* doing is one of the more useful things we did during planning. Every item above represents an idea someone had, a debate we had, and a decision to focus. The items still on the list are there because we were ruthless about cutting the ones that weren't.

For the items we *are* committed to building, see [What It Does](/design/what-it-does/).
