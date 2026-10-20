# Waymark

Self-hostable, community-built learning roadmaps. Think roadmap.sh, but anyone
with an account on your instance can author a roadmap in the browser, with
rich descriptions, screenshots, a "common issues" FAQ per node, resource links,
a changelog, search, deep links, and learner progress that follows them across
devices.

Made for the "a roadmap for X" itch: programming fundamentals for new
graduates, Class 9 CBSE Maths, onboarding onto an internal platform. A school
or a company can run its own private copy with one command.

> Working name and licence are placeholders (MIT). Rename freely.

## Run it

**Docker (recommended for a school or team):**

```
docker compose up -d
```

Open http://localhost:8080. The first account you create becomes the
administrator. All data (users, roadmaps, screenshots) is plain JSON and image
files in the `openroadmap-data` volume; back it up with `docker cp` or mount a
host folder instead.

**Single binary, no Docker:**

```
make all              # builds the web app, then a Go binary with it embedded
./server/bin/server -data ./data
```

Configuration is by flag or environment variable:

| Env             | Flag               | Default   | Notes                                   |
|-----------------|--------------------|-----------|-----------------------------------------|
| `ADDR`          | `-addr`            | `:8080`   | listen address                          |
| `DATA_DIR`      | `-data`            | `./data`  | where everything is stored              |
| `SECURE_COOKIES`| `-secure-cookies`  | off       | set `1` once you are behind HTTPS        |

Put a reverse proxy (Caddy, nginx, Traefik) in front for TLS.

**Windows, no Docker:** run `run-local.ps1` from the project root in PowerShell.
It checks for Go and Node.js (offering to install either via `winget` if
missing), builds the web app, builds `server\bin\server.exe` with it
embedded, and starts the server, opening http://localhost:8080. Data goes in
`.\data`. Re-run with `-SkipBuild` to just restart the existing binary, or
`-Port 9000` to use a different port.

```
.\run-local.ps1
```

## How it works for people

- **Learners** browse published roadmaps, click nodes for details, tick items
  off. Signed out, progress stays in the browser; signed in, it syncs, and the
  local copy is merged in on first sign-in.
- **Authors** create an account, build a roadmap in the editor (outline on the
  left, live preview on the right; paste screenshots straight from the
  clipboard), then submit it. Autosave runs a second and a half after every
  change; Ctrl+S records a named revision you can restore later.
- **Admins** see a review queue, publish or send back with a note, manage
  roles, and decide whether sign-up is open and whether member roadmaps need
  review. The first account is the admin.

## Importing from the single-file builder

The document format is the same as `roadmap-builder.html` exports, so
**My roadmaps → Import JSON** takes a `.roadmap.json` as-is, including inline
screenshots (they are moved into the image store). Going the other way,
**Download JSON (inline images)** produces a file the offline builder can open
and turn into an embeddable HTML page for Confluence or SharePoint.

## Project layout

```
server/                 Go 1.24, standard library only
  cmd/server/           main: flags, wiring, embedded SPA
  internal/api/         HTTP handlers (Go 1.22+ method routing on net/http)
  internal/auth/        PBKDF2 password hashing, tokens
  internal/content/     the roadmap document format: parse, validate, normalise
  internal/images/      content-addressed image store
  internal/model/       persisted types
  internal/store/       Store interface + file-backed implementation
  webdist/              `go:embed` of the built web app
web/                    React 19 + TypeScript + Vite
  src/lib/layout.ts     pure layout engine (spine + bezier edges)
  src/lib/md.ts         markdown-lite renderer (escape-first)
  src/viewer/           RoadmapView: map/checklist, drawer, search, deep links
  src/builder/          editor: outline, inspector, rich text, images, history
  src/pages/            browse, reader, auth, my roadmaps, admin
scripts/smoke.sh        API end-to-end test against a fresh server
scripts/ui-smoke.mjs    headless-browser test of the whole flow
```

### Why a file store and not a database?

An instance for a school or a team holds hundreds of roadmaps, not millions.
A directory of JSON files needs no service to run, backs up with `cp`, diffs
in git, and is readable by a human when something goes wrong. Everything goes
through the `store.Store` interface, so a SQLite or Postgres implementation is
a contained piece of work when an instance outgrows it (see `CONTRIBUTING.md`).

## API

All JSON, cookie session. Public: `GET /api/settings`, `GET /api/roadmaps?q=&tag=`,
`GET /api/roadmaps/{slug}`, `GET /api/roadmaps/{slug}/export?inline=1`, `GET /img/{name}`.
Auth: `POST /api/auth/{register,login,logout}`, `GET /api/auth/me`.
Signed in: `GET /api/me/roadmaps`, `POST /api/roadmaps`, `POST /api/roadmaps/import`,
`GET|PUT|DELETE /api/r/{id}`, `POST /api/r/{id}/{submit,publish,unpublish,reject}`,
`GET /api/r/{id}/revisions[/{n}]`, `GET|PUT /api/r/{id}/progress`, `POST /api/images`.
Admin: `GET /api/admin/review`, `GET /api/admin/users`, `PUT /api/admin/users/{id}/role`,
`GET|PUT /api/admin/settings`.

## Developing

```
make dev-api      # Go on :8080 (serves API only until the web app is built)
make dev-web      # Vite on :5173 with /api proxied to :8080
make test         # vet + API smoke test
```

The UI test needs Playwright: `npm i -g playwright && npx playwright install chromium`,
then `node scripts/ui-smoke.mjs http://127.0.0.1:8080`.

## Roadmap for the roadmap tool

Rough order of what is missing, in case you want to pick something up:

1. Admin-created accounts and password reset (invite-only instances need them).
2. OIDC / GitHub sign-in for public instances.
3. Standalone HTML export from the server (the offline builder still does this today).
4. A SQLite `store.Store` for larger instances.
5. Comments or suggestions on a node, so learners can propose fixes without edit rights.
6. Forking a roadmap (copy to my roadmaps) and attribution.
7. Rate limiting on register/login and on image upload.

See `CONTRIBUTING.md`.
