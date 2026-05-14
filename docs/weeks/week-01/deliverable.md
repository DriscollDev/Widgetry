---
layout: week
title: Project Proposal
week_number: 1
hide_week_nav: true
permalink: /weeks/week-01/deliverable.html
---

> Paste or rewrite the proposal content here. Markdown is fine; the page picks up
> the site's typography automatically. Headings used here will render with the
> magitech display face; body copy uses Inter.

# Project Proposal: Widgetry

---
## 1. Project Description

Widgetry is a web application for composing personal monitoring and information dashboards out of grid-based, configurable widgets. Users create boards, place widgets tied to API endpoints or built-in data sources, arrange and resize them on a 12-column grid, and view live status, values, and historical trends from a single browser tab.

---

## 2. Problem Statement and Opportunity

Developers and information-consumers routinely pull data from many disconnected services: uptime monitors, weather APIs, financial feeds, internal service health endpoints, and ad-hoc public JSON APIs. The tools available today cluster at two extremes:

- **Narrow single-purpose dashboards** - Uptimerobot's own UI, dedicated weather apps, individual financial trackers. Each does one thing well but forces users to context-switch between many tabs and accounts.
- **Heavyweight technical tools** - Grafana, custom Node-RED flows, in-house dashboards. These are powerful but demand significant setup, infrastructure, and engineering effort that exceeds what most users will invest for a personal monitoring view.

There is no approachable middle ground that lets a non-specialist user assemble a personal dashboard from arbitrary APIs without writing code or standing up infrastructure. Widgetry builds that middle ground: a configuration-only, browser-based dashboard composer that ships with useful built-in widgets and accepts arbitrary JSON APIs as first-class custom widgets.

---

## 3. Target Users

The website is designed around three personas, in priority order:

|Persona|Description|Primary use|
|---|---|---|
|**Developer Dana**|Builds and maintains web projects; wants passive visibility into uptime|Uptime widgets pointed at their own deployments and dependencies|
|**Hobbyist Hal**|Personal user who wants a daily glance dashboard|Weather, clock, currency, stocks on a single board|
|**Data-Curious Del**|Aggregates public API data from multiple sources into organized views|Custom JSON widgets pointing at public APIs they have discovered|

Developer Dana takes priority because they exercise the most technically distinguishing capability - server-side polling of monitored endpoints with historical snapshots. Hobbyist Hal validates the breadth of the built-in catalog. Data-Curious Del exercises the custom widget pipeline, which is both the most powerful capability and the most security-sensitive code path in the system.

---

## 4. Proposed Solution

Widgetry presents users with a small set of intuitive primitives:

- A **board** is a single dashboard, owned by one user, containing a grid of widgets.
- A **widget** is a configured data source rendered onto a board.
- The **grid** is a 12-column logical layout; widgets occupy rectangular spans of whole cells from 1×1 to 6×6 and never overlap.

After signing up (email + password or Google OAuth), a user creates a board, browses a widget catalog, configures a widget through a generic form generated from each widget type's schema, and drags or resizes the widget into place. For widgets that support history, the system stores snapshots at the user's chosen refresh interval and renders a timeline chart on demand. Snapshot retention is configurable per widget from 12 hours up to 30 days.

For data sources outside the built-in catalog, a **custom JSON widget** accepts a URL, optional headers, an optional API key, and a dot-notation path expression (e.g., `data.items[0].price`) identifying the field to display. User-supplied API keys are stored using envelope encryption under a server-managed master key and cannot be retrieved in plaintext from the UI.

---

## 5. Core Capabilities

The project will deliver seven user-facing capability areas:

1. **Account management.** Email + password and Google OAuth sign-in; email verification; password reset via time-limited tokens; account deletion with full data cascade.
2. **Board management.** Up to ten boards per user; rename, delete, and choose refresh mode (automatic at a selectable interval, or manual).
3. **Widget placement.** Drag, resize, and delete widgets on a 12-column grid, with reject-on-overlap conflict handling and immediate visual feedback.
4. **Built-in widget catalog.** Six fixed-purpose widget types covering monitoring and informational use cases (see §6).
5. **Custom data widgets.** User-defined widgets that pull from arbitrary HTTP(S) JSON APIs, with SSRF-protected outbound fetches.
6. **Historical data and timeline views.** Snapshot storage for widgets that support history, with per-widget retention and on-demand timeline chart rendering.
7. **Secure credentials.** Envelope-encrypted, write-only API key storage for custom widgets that require authentication.

---

## 6. Widget Catalog

The MVP ships seven widget types:

|Widget|Data source|Display|History|
|---|---|---|:-:|
|Uptime|User-supplied URL (HTTP GET)|Current status, latest response time, history chart|✓|
|Weather|Open-Meteo (no auth required)|Temperature, condition, location|-|
|Stock Price|Alpha Vantage or Finnhub (free tier)|Last price, daily change %, history chart|✓|
|Currency Exchange|exchangerate.host or Frankfurter|Rate between two currency codes|-|
|Date / Time|Client-local|Formatted date/time with user-selected timezone|-|
|Clock|Client-local|Analog or digital clock face|-|
|Custom JSON|User-supplied URL + optional API key|Value, key-value list, or timeline (numeric only)|✓|

The catalog is registry-driven: adding a new widget type means declaring its configuration schema and renderer in code. No database migration is required. This keeps the per-widget marginal development cost low and is the structural reason the MVP can afford to ship seven distinct widgets in a 10-week build.

---

## 7. Technology Stack

The implementation stack is locked. Choices favor mature, well-supported components that suit a small team's bandwidth and the capstone deployment target.

|Layer|Choice|Rationale|
|---|---|---|
|Frontend|SvelteKit + Skeleton UI v3|Team familiarity; built-in routing and SSR; Tailwind-based component library|
|Backend API|Fastify (Node.js LTS)|Fast, schema-first, strong plugin ecosystem|
|Background worker|Node.js + BullMQ|Mature Redis-backed queue; separates polling work from the request path|
|Database|PostgreSQL 16 + Drizzle ORM|Type-safe, lightweight ORM over standard Postgres|
|Queue and cache|Redis 7|BullMQ requirement; doubles as rate-limit and short-lived cache store|
|Authentication|Better-Auth|Actively maintained; supports email + password, Google OAuth, sessions, verification, and reset out of the box|
|Transactional email|Resend|Free tier sufficient for capstone scale; clean SDK|
|Validation|Zod|Shared schemas between frontend and backend|
|Testing|Vitest + Playwright|Unit and integration tests in Vitest; end-to-end in Playwright|
|Hosting|Railway|Managed Postgres and Redis plugins; per-service deploys|
|Monorepo tooling|pnpm workspaces|Shared `db`, `shared`, and `config` packages across three apps|

The deployed system consists of three services - a SvelteKit web frontend, a Fastify API, and a BullMQ worker - backed by managed PostgreSQL and Redis.

---

