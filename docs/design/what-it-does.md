---
title: What It Does
permalink: /design/what-it-does/
---

This page walks through the product as a user experiences it. We've left placeholders for screenshots; once development is underway we'll drop them in.

## Signing up

You create an account with an email and a password, or you sign in with your Google account. We send a verification email so you can confirm your address. You can use the app right away - verifying your email is required only for things like resetting a forgotten password.

> *[Screenshot: sign-up page]*

## Your first board

After you sign in, you land on your dashboard. If you're new, you'll have an empty *board* - think of it as a single page where widgets live. You can give it a name like "Morning Check-in" or "Project Health."

You can have up to ten boards. Most people will have two or three.

> *[Screenshot: empty board]*

## Adding widgets

Click "Add widget" and you'll see the catalog. We ship with seven kinds of widgets out of the box:

- **Clock** - an analog or digital clock in any timezone
- **Date and Time** - formatted date and time
- **Weather** - current temperature and conditions for a location
- **Stock Price** - last price and daily change for a stock symbol
- **Currency Exchange** - current rate between two currencies
- **Uptime** - checks whether a website is responding, and shows recent history
- **Custom JSON** - the flexible one (more below)

Each widget asks you a few questions when you add it. For weather, it's "where are you?" For stocks, it's "which symbol?" For uptime, it's "what's the URL?"

> *[Screenshot: widget catalog]*

## Arranging the board

The board is a grid. You drag widgets around to place them, and you drag the edges to resize them. A widget can be as small as a single grid cell or as large as a six-by-six block.

If you try to drop a widget on top of another one, it'll snap back and flash to let you know it didn't fit. We made this choice deliberately; you can read [more about it in our decisions log](/design/planning-key-decisions/).

> *[Screenshot: drag-and-resize in action]*

## The custom widget

This is the flexibility lever. If there's a public web service that returns data, and there are thousands, you can probably display a value from it.

You give us:

1. A web address (URL) where the data lives.
2. Optionally, an API key if the source requires one. We store it securely and never show it back to you in plain text.
3. A *path* describing which piece of the response to show. For example, if the response is `{"weather": {"temp": 72}}`, the path `weather.temp` would display `72`.
4. How often to fetch new data. The minimum is once per hour.

We do the rest: fetching on schedule, handling errors gracefully, displaying the value, and storing history if you want a chart.

> *[Screenshot: custom widget configuration form]*

## History and timelines

Some widgets - uptime, stocks, and custom widgets that return numbers - store a history of what they've shown over time. You can click into one and see a chart of the last few hours, days, or up to thirty days, depending on how long you've asked us to keep the data.

> *[Screenshot: timeline chart]*

## Refreshing

Boards refresh on a schedule you choose: every 30 seconds, every minute, every five minutes, and so on up to once an hour. You can also hit a refresh button to update everything right now. (For widgets that hit external services, there's a brief cooldown to avoid hammering those services.)

## Deleting things

You can delete a widget, delete a board, or delete your entire account. If you delete your account, everything you've created - boards, widgets, stored API keys, history - is removed within 24 hours.

## What you can't do (yet)

We've made deliberate choices about what's *not* in the first version, and we've documented those separately. Read [What It Doesn't Do (Yet)](/design/what-it-doesnt-do/) for the list and the reasoning.
