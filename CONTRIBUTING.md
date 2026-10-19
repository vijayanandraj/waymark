# Contributing

Two ways to contribute, and both are welcome.

## 1. Contribute a roadmap

You do not need to know git, or have an account, to write one.

1. Open **Write** on the site (or **Suggest changes** on an existing roadmap).
   Drafts are saved in your browser as you type.
2. Fill in **Details**: who the roadmap is for, tags, language and the name you
   want credited. Never an email address; the repository is public.
3. **Check** runs the same rules as the pull request check. Fix anything it
   lists under "Must fix".
4. **Submit** gives you a package (a `.zip` of `roadmaps/<slug>/`) and a
   prefilled submission form. One-click submission without GitHub is the next
   step of ADR 0001; until then the form needs a free GitHub account.

Developers can skip the form: unzip the package at the repository root (or
write the folder by hand, as described in `roadmaps/README.md`), run
`node site/scripts/validate.mjs`, and open a pull request.

Some habits that make a roadmap useful to strangers:

- **Say who it is for.** "Class 9 students revising for the final exam" beats
  "maths". The audience decides what to include and what to leave out.
- **Milestones on the spine, steps off it.** A milestone is "you can now do
  X"; its steps are what you learn to get there. Keep it to four levels.
- **Mark the type honestly.** `Core` is required, `Alternative` is a swap for a
  sibling, `Optional` is nice-to-have. Readers use this to budget time.
- **Every step gets a description and at least one free resource.** A link with
  no context is a bookmark, not a roadmap. Say what to read and why.
- **Use Common issues for the thing that trips people up.** Put runnable commands
  in a code block; readers get a Copy button.
- **Screenshots earn their place.** Add them when something is confusing, not to
  decorate.
- **Keep the changelog.** One line per meaningful change, newest first.

### Licence of contributions

Roadmap content is licensed CC BY-SA 4.0 (`roadmaps/LICENSE`). By
contributing a roadmap or a change to one, you confirm you wrote it or have the
right to share it, and agree to license it under those terms. Do not paste
material copied from textbooks or paid courses; link to it instead.

### Reviewing

Every change is reviewed by a person before it is published. Reviewers check
that the audience is clear, the order makes sense, resources are free (or
clearly marked), and nothing is copied. `.github/CODEOWNERS` lists who reviews
what; curators of a subject can be added there per roadmap.

## 2. Contribute code

```
roadmaps/               content (CC BY-SA 4.0)
site/                   static site: React 19 + TypeScript + Vite
  src/lib/rules.mjs     the content rules, shared by CI and the editor
  scripts/validate.mjs  runs them over roadmaps/ (no npm install needed)
  scripts/build-content.mjs, prerender.mjs   build steps around Vite
  src/viewer/           the roadmap map/checklist view
  src/write/            the editor: drafts in IndexedDB, checks, package export
tools/                  the offline single-file builder
selfhost/               the self-hosted server for private instances
docs/adr/               decisions and why they were made
```

```
cd site && npm install && npm run dev      # http://localhost:5174
npm run build                              # what CI deploys to GitHub Pages
```

- Frontend is React 19 + TypeScript, strict mode, no UI framework. `npm run build`
  runs `tsc` first, so type errors fail the build.
- The site is static. Anything that needs a server belongs in the submission
  service (ADR 0001), not the site.
- The document format is a contract with existing roadmaps, the offline builder
  and `selfhost/`. Additive changes only; never rename or repurpose a field.
  Rules go in `site/src/lib/rules.mjs` and `roadmaps/README.md` together.
- Security: every authored string is rendered through `esc()` or React; link
  hrefs are checked for scheme; images come only from the roadmap's own
  `images/` folder or an https URL. Keep those invariants.
- No analytics or tracking scripts. Learners include children.

### The self-hosted server

`selfhost/` is a separate product (Go 1.24, standard library only). See
`selfhost/README.md`. Behaviour changes need a line in
`selfhost/scripts/smoke.sh` (API) or `selfhost/scripts/ui-smoke.mjs` (UI); to
add a SQL store, implement `store.Store` in
`selfhost/server/internal/store/sqlite.go` (modernc.org/sqlite is cgo-free).

### Pull requests

Small, focused, with the "why" in the description. A screenshot for anything
visual. Be kind in review; assume the author knows something you do not.
