# Waymark

Free, community-built learning roadmaps for anyone, not only developers: a new
graduate learning to program, a Class 9 CBSE student revising maths, a team
onboarding a new hire. Each step says what to learn and why, the problems
people commonly hit, screenshots where they help, and free resources to learn
it from.

- **Readers** need no account. Progress is kept in their browser.
- **Authors** write in the browser, no git and no account: drafts stay in
  their browser until they submit, and the editor runs the same checks a
  reviewer will. See `CONTRIBUTING.md`.
- **Everything is open.** Code is MIT; roadmap content is CC BY-SA 4.0. Fork
  the whole thing, content included.

How it works and why: `docs/adr/0001-git-backed-content-gitless-authoring.md`.

## What is here

```
roadmaps/                    the roadmaps: one folder each (format in roadmaps/README.md)
site/                        static site, built by GitHub Actions and served from GitHub Pages
tools/roadmap-builder.html   offline single-file builder; also exports an embeddable HTML page
selfhost/                    self-hosted server for a private school or company instance
docs/adr/                    design decisions
```

## Run the site locally

```
cd site
npm install
npm run dev          # http://localhost:5174
```

Check roadmaps without installing anything: `node site/scripts/validate.mjs`.

## Publishing

Pushing to `main` builds the site and deploys it to GitHub Pages
(`.github/workflows/site.yml`). Enable it once under the repository's
Settings → Pages → Source: GitHub Actions. Pull requests get the same
validation and build, plus a link check on the roadmaps they change; a weekly
run opens an issue for links that have broken since.
