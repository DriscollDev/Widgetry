# Widgetry Capstone Wiki

Static site served from this directory by GitHub Pages. Custom subdomain routed
via `CNAME`.

## Local preview

```bash
cd docs
bundle install   # one-time
bundle exec jekyll serve
```

Then visit `http://127.0.0.1:4000`.

If you don't have a `Gemfile`, the GitHub-Pages-compatible one is:

```ruby
source "https://rubygems.org"
gem "github-pages", group: :jekyll_plugins
```

## How the site is structured

- `_config.yml` — site metadata, the master list of weeks, team members, external
  links. **The weeks list here drives the home page tiles and the nav submenu.**
  When a week's title or deliverable kind changes, edit it here, not in the
  individual page.
- `_layouts/default.html` — site chrome (header, nav, footer).
- `_layouts/week.html` — week-page chrome (badge, action cards, pager). All files
  under `weeks/` use this layout automatically per the defaults in `_config.yml`.
- `_includes/nav.html` — primary navigation, rendered into the default layout.
- `assets/css/site.css` — magitech dark theme. Token-driven; edit tokens at the
  top, components below inherit.
- `index.md` — home page.
- `weeks/week-NN/index.md` — week landing. Brief description; action cards to the
  status report and deliverable are rendered automatically by `week.html`.
- `weeks/week-NN/status-report.md` — weekly status, structured per the template.
- `weeks/week-NN/deliverable.md` — the week's deliverable, or an embed page for
  artifacts that live outside the repo (Figma, dbdiagram).

## Adding deliverables — patterns by media type

**Markdown document** (Proposal, Heuristic Evaluation): write content directly in
the deliverable file.

**Static image** (Use Case Diagram, Class Diagrams): commit the export to
`assets/img/` and embed with a `<figure class="figure">`. Always include `alt`
text.

**Interactive embed** (ERD via dbdiagram): use the iframe pattern shown in
`weeks/week-04/deliverable.md`. Also export a static image and commit the
underlying source so the page works without the embed.

**Slide deck** (Mid-Term, Final): export from Google Slides as PDF, commit to
`assets/slides/`, embed with `<object>`. Always include a download link and a
link to the live deck.

**Mermaid chart** (Gantt): commit both the `.mmd` source and a rendered image to
`assets/img/`. Show the image; keep the source in a `<details>` block. Rebuild
the image with `mmdc -i source.mmd -o rendered.svg` when the source changes.

**External link** (Figma prototype): write a brief Markdown page with the link
and embedded screenshots so the page is meaningful even without clicking out.

## Style notes

- Status colors are CSS variables (`--status-up`, `--status-down`, etc.) and
  surface as utility classes (`.status-up`, `.status-down`). Use them inside
  deliverable pages where appropriate.
- Headings render in Cinzel automatically. Don't over-use H1 — there is one per
  page (the layout supplies it).

## Logo files

- `assets/img/logo-mark.png` — the wizard-hat-and-gear mark, used in the header
  (32px tall) and footer ornament (24px tall).
- `assets/img/logo-full.png` — the full logo including the "Widgetry" wordmark,
  used as the home page hero (200px tall on desktop, 140px on narrow screens).
- `assets/img/favicon.svg` — a simplified gear-and-violet mark that reads at
  16×16 tab sizes; geometric echo of the main logo, not a direct downscale.

If you replace either PNG, keep the filename the same and no template edits are
needed. If you want to swap in higher-resolution `@2x` files, the simplest path
is to overwrite the PNGs in place with the new versions — the templates request
explicit `height` and `width` attributes on the `<img>` tags but the browser will
honor whatever the underlying pixel density gives it.

## TODOs before going live

- Fill `team` in `_config.yml`.
- Fill `external_links` URLs in `_config.yml` (Design Wiki, GitHub Repo).
- Replace `EMBED_ID` in `weeks/week-04/deliverable.md` once the dbdiagram embed
  is generated.
- Replace `SLIDES_LINK` in `weeks/week-05/deliverable.md` (and the analogous
  one in week 10 once it exists).
- Export and commit static fallback images: `assets/img/erd.svg`,
  `assets/img/gantt.svg`, plus per-week diagrams as they land.
- Each week, fill the `index.md` summary and the `status-report.md`.
