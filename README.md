# Widgetry

Widgetry is a customizable, API-monitoring dashboard: users build grid **boards**
of **widgets** (uptime checks, weather, stocks, currency, custom JSON endpoints,
and local widgets like clocks) that pull from external APIs on a schedule.

University capstone project by the **Pokeballers** (3-person team).

## Tech stack

| Layer         | Technology                                             |
| ------------- | ------------------------------------------------------ |
| Web frontend  | SvelteKit (Node adapter) + Skeleton UI v3 + Tailwind 4 |
| HTTP API      | Fastify + Better-Auth, behind the SvelteKit proxy      |
| Background    | BullMQ worker (widget polling)                         |
| Data          | Postgres 16 + Drizzle ORM, Redis - remote (Railway)    |
| Tooling       | pnpm workspaces, TypeScript, Vitest, Playwright        |
| Hosting       | Railway                                                |

The browser only ever talks to the **web** service; `web` proxies every `/v1/*`
request to **api** over the private network (see `apps/web/src/hooks.server.ts`).

## Repository layout

pnpm monorepo. Everything runs from this repository root.

```
Widgetry/
├── apps/
│   ├── web/          # SvelteKit app (frontend + /v1 proxy)
│   ├── api/          # Fastify HTTP API                       
│   └── worker/       # BullMQ polling worker                  
└── packages/
    ├── db/           # Drizzle schema, migrations, client
    ├── shared/       # Zod API contracts + widget schemas
    └── config/       # Env loading / runtime config
```

## Prerequisites

- **Node.js ≥ 20** (LTS). Check with `node -v`.
- **pnpm 9.12.0** - pinned via the `packageManager` field (see below).

### Installing pnpm

The project pins pnpm through the `packageManager` field in `package.json`, so
the recommended path on **every** OS is **Corepack** (ships with Node ≥ 16.9),
which reads that field and uses the exact pinned version automatically.

**Recommended - Corepack (Windows & macOS, identical):**

```bash
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm -v   # → 9.12.0
```

If `corepack` isn't found, update Node, or install it with `npm i -g corepack`.

**Windows - alternatives:**

```powershell
# Option A: winget
winget install pnpm.pnpm

# Option B: standalone installer (no Node required)
Invoke-WebRequest https://get.pnpm.io/install.ps1 -UseBasicParsing | Invoke-Expression

# Option C: npm (if you already have Node)
npm install -g pnpm@9.12.0
```

**macOS - alternatives:**

```bash
# Option A: Homebrew
brew install pnpm

# Option B: standalone installer (no Node required)
curl -fsSL https://get.pnpm.io/install.sh | sh -

# Option C: npm (if you already have Node)
npm install -g pnpm@9.12.0
```

After installing outside Corepack, restart your terminal and confirm `pnpm -v`
reports `9.12.0`. Corepack remains the source of truth for the version CI uses.

## Getting started

```bash
# 1. Clone
git clone <repo-url> Widgetry
cd Widgetry

# 2. Install all workspace dependencies
pnpm install

# 3. Create your local env file, then fill in the blanks
cp .env.example .env       # Windows PowerShell: copy .env.example .env

# 4. Run the web app (http://localhost:5173)
pnpm --filter @widgetry/web dev
```

`pnpm dev` runs every service in parallel; while `api`/`worker` are still stubs,
targeting the web app with `--filter @widgetry/web dev` is the useful command.

> **No local database.** Postgres and Redis are remote (hosted on Railway) -
> there's nothing to spin up locally and no Docker required. `api`/`worker`
> connect using the `DATABASE_URL` / `REDIS_URL` values in your `.env`.


## Common commands

All commands run from the repository root.

| Command                            | What it does                                        |
| ---------------------------------- | --------------------------------------------------- |
| `pnpm install`                     | Install all workspace dependencies                  |
| `pnpm dev`                         | Run web + api + worker in parallel (dev mode)       |
| `pnpm --filter @widgetry/web dev`  | Run just the web app                                |
| `pnpm build`                       | Build every app and package                         |
| `pnpm typecheck`                   | Type-check the whole workspace                      |
| `pnpm lint`                        | ESLint + Prettier check (matches CI)                |
| `pnpm lint:fix` / `pnpm format`    | Auto-fix lint issues / format all files             |
| `pnpm test:unit`                   | Run unit tests (Vitest)                             |
| `pnpm test:integration`            | Run integration tests _(needs DB/Redis env vars set)_ |

Per-package scripts are reachable with `pnpm --filter <name> <script>`, e.g.
`pnpm --filter @widgetry/web build`.

## Web app specifics

- **Dev server:** `pnpm --filter @widgetry/web dev` → http://localhost:5173
- **Routes** follow the Screen Inventory (`/`, `/sign-in`, `/boards`, …).
- **Theming:** Skeleton UI v3 theme is set on `<html data-theme="…">` in
  `apps/web/src/app.html`; global styles live in `apps/web/src/app.css`.
- **API calls:** never call the api host directly from the browser. Use the
  `$lib` helper `apiUrl('boards')` → `/v1/boards`, which the server hook proxies
  to the api service.

## Contributing

- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).
- **Branches:** `feat/<desc>`, `fix/<desc>`, `chore/<desc>`.
- **CI** runs `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, and `pnpm build`
  on every PR - run them locally before pushing.
