---
title: The Problem We're Solving
permalink: /design/the-problem/
---

## The everyday version

Think about everything you check in a typical day. The weather. Maybe a stock or two. The status of a flight you're tracking. Whether your favorite streaming service is having an outage. The exchange rate for a trip you're planning. Each of these probably lives in a different app or a different website. You spend a surprising amount of time tab-hopping just to get a picture of "the things I care about right now."

People have been trying to solve this for a long time. The old "personal homepage" idea - Yahoo's My Yahoo, iGoogle, the Windows Vista sidebar - was an early attempt. Those products mostly disappeared, but the underlying need didn't.

## What exists today

The current options fall into two camps, and there's a wide gap in the middle.

On one side, there are **single-purpose tools**. A weather app shows you the weather. An uptime monitoring service shows you whether your websites are online. A stocks app shows you stocks. Each one is good at its one job, but you end up with five of them open and no unified view.

On the other side, there are **professional monitoring tools** like Grafana or Datadog. These can show you almost anything in one place, but they're built for engineers running production systems. Setting one up means standing up a server, learning a query language, and configuring data sources by hand. They're powerful, but the on-ramp is steep enough that most people never get there.

## The gap

There's no comfortable middle ground - something approachable enough that a curious person can get value out of it in ten minutes, but flexible enough that they're not boxed into the categories some product manager picked for them.

That's the gap we're trying to fill.

## What we're building

A web application where you create dashboards (we call them *boards*) and arrange *widgets* on them. Some widgets are pre-built for common things - weather, time, stock prices, website uptime. One special widget lets you point at almost any public data source on the internet and pull a value from it.

You don't need to install anything. You don't need to write code. You don't need to run a server. You sign up, you build your board, you visit it whenever you want.

## Why it matters

For us as a project, this hits a sweet spot for capstone work: the user-facing concept is simple enough to demo in two minutes, but the engineering underneath has real depth. Building it requires us to handle authentication, scheduled background work, third-party API integration, security against a class of attacks called SSRF (which we cover in [Keeping Your Data Safe](/design/how-it-works-keeping-data-safe/)), and a drag-and-drop interface that has to feel responsive. It's a project where the "easy to describe" part hides a lot of interesting problems.
