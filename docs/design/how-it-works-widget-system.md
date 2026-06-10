---
title: The Widget System
permalink: /design/how-it-works-widget-system/
---

Widgets are the most user-visible part of the product, but the design behind them has some interesting depth. This page explains how we organized them.

## Two kinds of widgets

We split widgets into two categories. The split shapes almost every other decision we made about them.

**Fixed widgets** are widgets we built for a specific purpose. The weather widget knows how to talk to a weather service. The stock widget knows how to talk to a stock-quote service. The clock widget knows how to display a clock. Each one is a complete, finished thing - you configure it (which city, which stock symbol), but you don't change what it fundamentally does.

**The custom widget** is one widget type that does almost anything. You point it at a web address, tell it which piece of the response to display, and it fetches that value on a schedule. One widget, infinite possibilities.

We thought about this division carefully. The fixed widgets are easier to use - you don't have to know what an API is to add the weather widget. The custom widget is more powerful but expects you to understand what you're pointing it at. Together, they cover the full range from "I just want the weather" to "I want to display the current count of polar bears according to this scientific data feed I found."

## How widgets fetch their data

Different widgets get their data different ways, and the difference matters because it determines how fresh the data is and how it can be displayed.

**Some widgets get their data from your browser.** The clock is the simplest example: your computer already knows what time it is, so the widget just reads that. The weather widget asks a weather service from inside your browser. These widgets refresh as often as you'd like - every 30 seconds if you want - because asking once doesn't cost much.

**Some widgets are fetched by our worker in the background.** The uptime widget is a good example. To know whether a website is up, *something* needs to actually try to load that website. We do that on the server, on a schedule, and store the result. When you load the dashboard, you see the most recent stored result. These widgets refresh at most once per hour, because we have many users and we don't want to hammer the websites being monitored.

The custom widget falls into this second category. We fetch it on the server because that's the only way we can store history, and because the API key (if any) needs to stay on our server rather than being shipped to your browser.

## How we add new widget types

One of the design goals was that adding a new widget type shouldn't require rewriting the system. We organized the code so that each widget type is a small, self-contained package. Adding a new one - say, a "package tracking" widget that watches a shipment - would mean writing the widget's data-fetching logic, defining what configuration it needs (a tracking number), and writing the visual component that displays it. Everything else - saving the configuration, scheduling the fetches, displaying the catalog - is handled by code that doesn't need to change.

This kind of "add a thing without touching the framework" design is a well-known pattern, but doing it well is harder than it sounds. The reason it's worth the effort: if the project lives past the capstone and someone wants to add a tenth widget type, they can do it without learning the entire codebase.

## The custom widget in more detail

The custom widget deserves its own explanation because it's the most complex.

When you set one up, you give us four things:

1. **A URL.** The web address of the data source.
2. **An optional API key.** If the source requires authentication, you provide it once and we store it encrypted. (Read [Keeping Your Data Safe](/design/how-it-works-keeping-data-safe/) for what "encrypted" actually means here.)
3. **A path.** Most data sources return information in a structured format called JSON, which looks roughly like nested labels and values. The path tells us which value to extract. If the response is `{"weather": {"temperature": 72}}`, the path `weather.temperature` gives us `72`.
4. **A refresh interval.** How often to fetch new data. The minimum is once per hour, both to limit our load and to be polite to the data sources.

When the widget runs, our worker fetches the URL, parses the response, follows the path to find the value, and stores it. If anything goes wrong - the URL doesn't respond, the response isn't valid JSON, the path doesn't lead anywhere - we store an error instead and show a friendly message on the widget rather than crashing.

The custom widget is also where the most interesting security work lives. Letting users tell our server to fetch *any* URL is dangerous if you don't think it through carefully. We cover the why and the how on the [Keeping Your Data Safe](/design/how-it-works-keeping-data-safe/) page.
