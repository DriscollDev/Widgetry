---
title: Boards & Widgets
permalink: /boards-and-widgets/
description: Using boards, widget types, layout, and refresh in Widgetry.
---

## Boards

A **board** is a single dashboard page. You can have up to ten, each with its own name and widget layout. Use separate boards for different contexts - a "Morning Check-in" board with weather and stocks, a "Project Health" board with uptime monitors, and so on.

Each board has a refresh setting: automatic on an interval you choose (30 seconds up to one hour), or manual only.

## Widget catalog

Widgetry ships with seven widget types:

| Widget | What it shows | How it updates |
|--------|---------------|----------------|
| **Clock** | Analog or digital time in any timezone | From your browser |
| **Date and Time** | Formatted date and time | From your browser |
| **Weather** | Current temperature and conditions | From your browser |
| **Stock Price** | Last price and daily change | Server, on schedule |
| **Currency Exchange** | Rate between two currencies | Server, on schedule |
| **Uptime** | Whether a URL is responding, with recent history | Server, on schedule |
| **Custom JSON** | Any value from a public API you point at | Server, on schedule |

Fixed widgets (weather, clock, etc.) are ready to use - just answer a few configuration questions. The **custom JSON** widget is the flexible one: you provide a URL, optionally an API key, and a path describing which value to display.

## Layout

The board is a grid. Widgets snap to cells as you drag them.

- Minimum size: one grid cell
- Maximum size: six cells wide by six cells tall
- Overlapping widgets are not allowed - if a move would overlap, the widget snaps back

Changes save automatically after a brief pause. If the server rejects a move (for example, because another tab changed the board), the widget reverts to its previous position.

## History and charts

Some widgets store data over time: uptime checks, stock prices, and custom widgets that return numbers. Click into a widget to see a chart of the last few hours, days, or up to thirty days - depending on how long you've asked us to keep the data.

## Refreshing

- **Automatic:** Set a board-wide refresh interval. The page polls for updates on that schedule.
- **Manual:** Hit the refresh button to update everything immediately. Widgets that hit external services have a brief cooldown to avoid hammering those services.

Server-polled widgets (uptime, stocks, custom) fetch new data at most once per hour, regardless of how often you refresh the page.

## Custom JSON widget

The custom widget lets you display a value from almost any public data source:

1. **URL** - where the data lives
2. **API key** (optional) - stored encrypted; never shown back in plain text
3. **Path** - which value to extract, using dot notation (for example, `weather.temp` from `{"weather": {"temp": 72}}`)
4. **Refresh interval** - minimum once per hour

If a fetch fails, the widget shows a friendly error instead of breaking the board.

## Deleting things

You can delete individual widgets, entire boards, or your whole account. Account deletion removes all boards, widgets, stored API keys, and history within 24 hours.

## Limitations

The first version of Widgetry does not include alerts, board sharing, mobile layouts, or a widget marketplace. See the [Design wiki](/design/what-it-doesnt-do/) for the full list and reasoning.
