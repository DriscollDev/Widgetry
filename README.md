# Widgetry

Customizable widget-based API monitoring dashboards.
See `Project_Proposal.md`, `Feature_Specification.md`, and `Engineering_Document.md` for full context.

## Repository layout

This is a pnpm monorepo. Layout matches Engineering Doc §4.

```
Widgetry/
├── apps/
│   ├── web/        SvelteKit + Skeleton UI (browser-facing)
│   ├── api/        Fastify HTTP API (auth, board/widget CRUD, job enqueue)
│   └── worker/     BullMQ consumer (polling, snapshots, retention purge)
├── packages/
│   ├── db/         Drizzle schema + migrations + client factory
│   ├── shared/     Zod schemas, widget type registry, API contracts
│   └── config/     Env loading + shared runtime config
├── .github/workflows/ci.yml
├── docker-compose.dev.yml
├── pnpm-workspace.yaml
└── package.json
```

The contents of every `apps/*` and `packages/*` directory are intentionally
stubbed at this stage — enough to typecheck, lint, and build cleanly under CI.
Sprint 1 fills in the real implementations per the engineering doc.

## Prerequisites

You need three things before cloning:

1. **Node.js 20.x (LTS).** Two ways to install:
   - **Direct (simplest):**
     - macOS: `brew install node@20`
     - Linux (Debian/Ubuntu): `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs`
     - Windows: `winget install OpenJS.NodeJS.LTS` (or download the LTS installer from [nodejs.org](https://nodejs.org)), then restart your terminal.
   - **Via nvm (only if you want to manage multiple Node versions):**
     - macOS / Linux / WSL: install from [nvm-sh/nvm](https://github.com/nvm-sh/nvm), close and reopen your terminal, then `nvm install 20`. The repo's `.nvmrc` lets you do `nvm use` from inside the project.
     - Windows native: nvm-sh does not work; use [nvm-windows](https://github.com/coreybutler/nvm-windows) instead. Syntax differs (`nvm use 20.18.0` requires the full version).

2. **pnpm 9.x via Corepack.** Corepack ships with Node 20, so once Node is installed:
   ```bash
   corepack enable
   ```
   No global `npm install -g pnpm` needed — the `packageManager` field in `package.json` pins the exact pnpm version, and Corepack downloads it on first use.

3. **Docker** (for local Postgres + Redis). [Docker Desktop](https://www.docker.com/products/docker-desktop/) on macOS/Windows; `docker.io` package on Linux.

Sanity check: `node -v` prints `v20.x.x`, `corepack -v` prints a version, `docker --version` prints a version.

## First-time setup

Target: under 15 minutes from clone to a working local stack (per Engineering Doc §17.3).

```bash
git clone <repo-url> Widgetry && cd Widgetry
pnpm install                                       # installs all workspaces (Corepack pulls pnpm on first run)
docker compose -f docker-compose.dev.yml up -d     # Postgres + Redis
cp .env.example .env                               # then fill in MASTER_ENCRYPTION_KEY etc.
pnpm dev                                           # runs web + api + worker concurrently
```

> **Windows native (not WSL):** the `cp` command above is `copy` in PowerShell/CMD. We recommend WSL for the smoothest experience — `docker-compose.dev.yml`, the bash scripts in CI, and the broader Node ecosystem assume a Unix-like shell.

Generate a local `MASTER_ENCRYPTION_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

When the Drizzle schema and seed scripts land (Sprint 1):

```bash
pnpm --filter @Widgetry/db migrate
pnpm --filter @Widgetry/db seed
```

## Common commands

| Command                   | What it does                                                   |
| ------------------------- | -------------------------------------------------------------- |
| `pnpm dev`                | Run web + api + worker in parallel (per-package `dev` script). |
| `pnpm build`              | Build every workspace package.                                 |
| `pnpm typecheck`          | `tsc --noEmit` across every workspace.                         |
| `pnpm lint`               | ESLint + Prettier check.                                       |
| `pnpm lint:fix`           | Auto-fix lint + format.                                        |
| `pnpm test:unit`          | Vitest unit tests (every workspace).                           |
| `pnpm test:integration`   | Vitest integration tests (needs Postgres + Redis running).     |

## Branching and PRs

Per Engineering Doc §17.1 / §17.4:

- `main` is always deployable. Protected. **1 approval** required to merge (3-dev team; 2 would block too often).
- Feature branches: `feat/<short-description>`, `fix/<short-description>`, `chore/<short-description>`.
- Rebase onto `main` at least every 48 hours; no long-lived feature branches.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).

## CI

`.github/workflows/ci.yml` runs on every PR and push to `main`:

1. `pnpm install` (with cache)
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm test:unit`
5. `pnpm test:integration` (Postgres 16 + Redis 7 service containers)
6. Per-app build

E2E (Playwright) runs on a separate nightly schedule — not added yet.

## Deployment

Railway's GitHub integration auto-deploys each service from `main`
(see Engineering Doc §14.2 and §16). No `deploy.yml` exists in this
repo by design — Railway's branch watcher handles it. A CI-driven
post-deploy smoke-test workflow is a phase-2 improvement.

Each service has its own Railway service definition with build/start commands:

| Service  | Build                                     | Start                                  |
| -------- | ----------------------------------------- | -------------------------------------- |
| `web`    | `pnpm --filter web build`                 | `pnpm --filter web preview`            |
| `api`    | `pnpm --filter api build` + `drizzle-kit migrate` | `node apps/api/dist/server.js`  |
| `worker` | `pnpm --filter worker build`              | `node apps/worker/dist/worker.js`      |

**Migrations run on `api` deploy only**, never on `worker` (Engineering Doc §14.2).

## Documentation

Source-of-truth docs live in the project root (or in your project tracker, depending on your team's setup):

- `Project_Proposal.md`
- `Feature_Specification.md` — locked v1.1
- `Engineering_Document.md` — ratified v1.0
- `Activity_Diagrams.md`
- `Entity_Relationship_Diagram.md`
