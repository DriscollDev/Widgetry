---
title: Who It's For
permalink: /design/who-its-for/
---

We designed this product around three kinds of users. Real people are usually a mix of all three, but having distinct personas helps us make decisions: when we're not sure whether a feature is worth building, we ask "which of our users actually wants this?"

## Developer Dana

Dana builds and maintains web projects, either professionally or as side projects. She has things she wants to keep an eye on - her own deployed websites, the third-party services they depend on, the API endpoints that her code talks to. She doesn't need a paging system or a dedicated monitoring platform; those are overkill. She wants a glance: are my things up? Have they been up all week? If something has been flaky, can I see when?

For Dana, success looks like opening one tab in the morning and immediately knowing whether anything she cares about needs attention.

**Dana is our priority user.** The features she relies on most - uptime monitoring, historical charts, custom data sources - are the ones we considered most carefully and committed to first.

## Hobbyist Hal

Hal isn't a developer. He's the kind of person who used to set up an iGoogle page back when those existed. He wants a personal dashboard for his day: the local weather, a clock showing the timezone where his daughter lives, the current value of his retirement account, today's exchange rate because he's planning a trip to Japan. He'll open it in the morning and maybe glance at it again at lunch.

For Hal, success looks like a calm, organized page that gives him the information he checks anyway, without making him visit five different sites.

## Data-Curious Del

Del is the most adventurous user. She knows that lots of public data is freely available on the internet - government datasets, transit systems publishing real-time information, public APIs from services she uses. She wants to pull values from those sources and display them alongside everything else.

Del is the user who will exercise our most flexible feature: the **custom widget**. She gives us a web address and tells us which piece of the response to display. We do the work of fetching it on a schedule and showing it to her.

For Del, success looks like building a board that nobody else could have built - a dashboard tailored to her specific interests, assembled from sources she discovered herself.

## Why these three

Together, these three personas cover the range of complexity we want to support. Hal proves the product is approachable enough for a non-technical user. Dana proves it's useful enough for someone who could build their own dashboard but would rather not. Del proves it's flexible enough that the ceiling is high.

If we built something only Hal would use, we'd be a weather app. If we built something only Del would use, we'd be a less-friendly version of Grafana. The whole point is to serve all three at once.
