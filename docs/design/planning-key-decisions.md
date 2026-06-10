---
title: Key Decisions
permalink: /design/planning-key-decisions/
---

A curated list of the decisions we made during planning that we think are most worth understanding. Each one follows the same pattern: the question we faced, the options we considered, what we chose, and why.

These aren't all of our decisions - there were dozens - but they're the ones where the choice meaningfully shaped the project.

## Dropping Downdetector

**The question.** Our original proposal mentioned integrating with Downdetector, a popular service that tracks website outages reported by users. Should we?

**The options.** Use Downdetector via paid API access (cost prohibitive for a student project). Scrape Downdetector's website (against their terms of service and unreliable). Build our own equivalent by directly checking whether a URL responds. Drop the feature entirely.

**What we chose.** We dropped Downdetector and built our own simple uptime checking. We send a request to a URL the user gives us and record whether it responded.

**Why.** Downdetector's value proposition is *crowdsourced* outage detection - they're useful when you want to know if a service is down for *everyone*, not just you. Our users mostly want to know whether a *specific* URL is responding right now. Direct checking gives them that, costs us nothing, and avoids the legal and reliability problems of scraping.

## Reject-and-snap-back when widgets overlap

**The question.** When a user drags a widget on top of another widget, what should happen?

**The options.** Reject the move and snap the widget back. Allow the overlap and let widgets stack. Push the other widget out of the way to make room (the way most spreadsheet "insert row" operations work).

**What we chose.** Reject and snap back, with a brief visual flash to make it clear what happened.

**Why.** Pushing widgets around sounds nice but cascades unpredictably - moving widget A pushes B, which pushes C, which now overlaps D, and so on. The rules for resolving these chains are surprisingly complex and the result often surprises the user. Rejection is honest: the move didn't work, here's why. Stacking would let widgets hide each other, which we considered worse than not allowing the move at all. With at most twenty widgets per board, the inconvenience of having to find an empty space is small.

## Making email verification mandatory

**The question.** When a user signs up, should we require them to verify their email address before using the product?

**The options.** Require verification before any use. Require verification before certain features (like password reset). Don't require verification at all.

**What we chose.** Allow use immediately, but require verification before password reset works. We display a banner reminding the user to verify until they do.

**Why.** Requiring verification up front is friction that loses users. But if a user signs up with a typo in their email, then forgets their password, they're permanently locked out - and we have no way to help them, because we can't confirm they own the account. Requiring verification specifically before password reset means the friction only kicks in when it actually matters. The banner gives a gentle nudge in the meantime.

A lurking concern: during the capstone defense, if a demo account got locked out at the wrong moment we'd have no recovery path. This decision insures against that scenario.

## Polling instead of push for updates

**The question.** When new data arrives - say, a new uptime check shows that a website went down - how does the user's browser find out?

**The options.** Push: keep a live connection open between the browser and our server, and immediately notify the browser when something changes. Pull: have the browser ask "what's new?" on a regular interval.

**What we chose.** Pull. The browser asks for updates on whatever interval the user has configured (as fast as every 30 seconds).

**Why.** The fastest our server fetches data is once an hour. The fastest the browser asks for updates is once every 30 seconds. The maximum delay between something happening and the user seeing it is 30 seconds. That's plenty fast for a dashboard application. A push system would be more complicated to build and wouldn't give the user a noticeably different experience. If we ever add real-time alerting (which we explicitly excluded from this version), push would become worth the cost.

## Three programs instead of one

**The question.** Should our entire application be one program, or should we split it into specialized pieces?

**The options.** A single program that does everything. Two programs (one for the website, one for the background work). Three programs (website, API, background worker as separate things).

**What we chose.** Three.

**Why.** The biggest reason: if the background worker is busy fetching data from a slow external service, we don't want that to slow down the user's clicks. Separating them means a slow fetch is contained - it can't make the website feel sluggish. The cost is a small amount of additional complexity in deployment, which our hosting platform handles cleanly.

## Storing API keys with envelope encryption

**The question.** Users will give us API keys for their custom widgets. How do we store them?

**The options.** Store them as plain text in the database. Encrypt them with a single key. Use envelope encryption - encrypt each key with its own random key, then encrypt those random keys with a master key.

**What we chose.** Envelope encryption.

**Why.** Plain text is irresponsible. Single-key encryption is reasonable but makes it expensive to ever rotate the key - you'd have to re-encrypt every stored secret. Envelope encryption gives us cheap key rotation (rotate the master key, re-encrypt only the small per-key keys) and aligns with how serious systems handle this kind of data. The added complexity is small and the practice is worth learning. We explain the technique in plain language on the [Keeping Your Data Safe](/design/how-it-works-keeping-data-safe/) page.

## A simple custom-widget query language

**The question.** When a user sets up a custom widget, they need to tell us which value to extract from the response. How rich should that query language be?

**The options.** Use a full standard called JSONPath, which can do complex things like "all items where the price is greater than 10." Use a much simpler dot-notation grammar that just walks down through nested data ("the price field of the third item"). Build something in between.

**What we chose.** The simple dot-notation grammar.

**Why.** Looking at real-world public APIs, the simple grammar covers nearly all of them. The one feature it can't do - extracting multiple values at once - adds a lot of complexity to the user interface, because we'd have to figure out how to display multiple values in a single widget. The simple grammar is also small enough that we can write the whole thing ourselves in about fifty lines of code, with no third-party dependency. Easy to test, easy to understand, easy to debug.

## Tiering features into must-have, should-have, and nice-to-have

**The question.** We have a long list of features we'd like to build. How do we make sure we ship a working product even if things take longer than expected?

**The options.** Try to build everything and hope it works out. Cut features ahead of time so the list is comfortably small. Tier the features and commit to cutting from the bottom up if needed.

**What we chose.** Tier them. Must-have features are the minimum acceptable product. Should-have features make it noticeably better. Nice-to-have features are polish.

**Why.** Cutting features up front feels safe but loses optionality. Tiering keeps the option open: if our pace is good through week six, we'll deliver should-haves and maybe some nice-to-haves. If we're behind, we cut from the top of the should-have list and protect the must-haves. The discipline this enforces - knowing which features we'd cut first - turns out to be more valuable than the cuts themselves, because it makes the unspoken priorities explicit.
