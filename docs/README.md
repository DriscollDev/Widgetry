# Widgetry Wiki

Jekyll site published at [wiki.widgetry.app](https://wiki.widgetry.app) via GitHub
Pages (`docs/` is the site root).

## Folder layout

All editable content lives in four folders. Everything else is site plumbing.

```
docs/
├── active/          ← Product docs (default landing page)
├── course/          ← Capstone course home page
├── design/          ← Planning specs and architecture
├── weeks/           ← Weekly deliverables (week-01 … week-10)
├── assets/          ← Images, CSS, slides, diagram sources
├── _config.yml      ← Site config, navigation, week list, team
├── _layouts/        ← Page templates
└── _includes/       ← Shared HTML fragments (nav)
```

| I want to… | Edit here |
|------------|-----------|
| Change product docs users see after launch | `active/*.md` |
| Update the capstone course landing page | `course/index.md` |
| Edit planning / architecture write-ups | `design/*.md` |
| Update a weekly deliverable or status report | `weeks/week-NN/*.md` |
| Add/remove a page from the sidebar | `_config.yml` → `active_nav` or `design_nav` |
| Add a new course week to the nav | `_config.yml` → `weeks`, then create `weeks/week-NN/` |
| Change header links or team list | `_config.yml` |

## The three wikis

| Wiki | Folder | Public URL |
|------|--------|------------|
| **Active** | `active/` | `/` (home), `/getting-started/`, etc. |
| **Course** | `course/` + `weeks/` | `/course/`, `/weeks/week-NN/` |
| **Design** | `design/` | `/design/…` |

Active is the default site entry. Header nav switches between all three.

### Adding an Active page

1. Create `active/my-page.md` with front matter:

   ```yaml
   ---
   title: My Page
   permalink: /my-page/
   ---
   ```

2. Add an entry to `active_nav` in `_config.yml` so it appears in the sidebar.

### Adding a Design page

1. Create `design/my-topic.md` with front matter:

   ```yaml
   ---
   title: My Topic
   permalink: /design/my-topic/
   ---
   ```

2. Add an entry to `design_nav` in `_config.yml` under the right section.

Permalinks control the public URL. The filename is only for your convenience -
kebab-case (`how-it-works-system-overview.md`) matches existing convention.

## Local preview

```bash
cd docs
bundle install   # one-time
bundle exec jekyll serve
```

Open `http://127.0.0.1:4000`.

## Week deliverable patterns

**Markdown** - write directly in `deliverable.md`.

**Static image** - commit to `assets/img/`, embed with `<figure class="figure">`.

**Interactive embed** - see `weeks/week-04/deliverable.md` for the dbdiagram iframe
pattern; always include a static fallback image.

**Slide deck** - export PDF to `assets/slides/`, embed with `<object>`, link to live deck.

**Mermaid chart** - commit `.mmd` source and rendered SVG to `assets/`; see week 08.

**External link** - brief markdown page with link and screenshots (week 03 pattern).

## Style notes

- Wiki pages get their H1 from the layout - start content at `##` in the markdown body.
- Mermaid blocks in `design/` pages render via the CDN script in `_layouts/default.html`.
- Theme tokens and components live in `assets/css/site.css`.
