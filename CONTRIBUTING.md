# Contributing

Two ways to contribute, and both are welcome.

## 1. Contribute a roadmap

You do not need to touch code. Create an account on a hosted instance, click
**My roadmaps → New roadmap**, and build it in the editor. Some habits that make
a roadmap useful to strangers:

- **Milestones on the spine, subtopics off it.** A milestone is "you can now do
  X"; its subtopics are what you learn to get there. Keep it to four levels.
- **Mark the type honestly.** `Core` is required, `Alternative` is a swap for a
  sibling, `Optional` is nice-to-have. Readers use this to budget time.
- **Every node gets a description and at least one free resource.** A link with
  no context is a bookmark, not a roadmap. Say what to read and why.
- **Use Common issues for the thing that trips people up.** Put runnable commands
  in a code block; readers get a Copy button.
- **Screenshots earn their place.** Paste them when a UI is confusing, not to
  decorate.
- **Keep the changelog.** One line per meaningful change, newest first.

Then **Submit for review**. An admin will publish it or send it back with a
note. If you want your roadmap to live in git as well, **Download JSON** and
open a pull request adding it under `examples/`.

## 2. Contribute code

- Backend is Go 1.24 with the standard library only; keep it that way unless a
  dependency is clearly earning its keep. `go vet ./...` must pass.
- Frontend is React 19 + TypeScript, strict mode, no UI framework. `npm run build`
  runs `tsc` first, so type errors fail the build.
- Behaviour changes need a line in `scripts/smoke.sh` (API) or
  `scripts/ui-smoke.mjs` (UI). Both run in CI.
- The document format in `server/internal/content` is a contract with existing
  roadmaps and with the offline single-file builder. Additive changes only;
  never rename or repurpose a field.
- Security: every string authored by a user is rendered through `esc()` or
  React; link hrefs are checked for scheme; images are only ever served from
  the content-addressed store or an http(s) URL. Keep those invariants when
  touching the renderer or the normaliser.

### Adding a SQL store

Implement `store.Store` in `server/internal/store/sqlite.go` (modernc.org/sqlite
is cgo-free and fits the single-binary goal), select it with a `-store` flag or
`STORE_DSN` env, and run `scripts/smoke.sh` against it. The file store stays the
default for zero-config installs.

### Pull requests

Small, focused, with the "why" in the description. A screenshot for anything
visual. Be kind in review; assume the author knows something you do not.
