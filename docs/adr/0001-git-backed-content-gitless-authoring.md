# ADR 0001: Roadmaps live in git; authors never see git

- Status: accepted
- Date: 2026-10-19

## Context

Open Roadmap started as a single-file builder and grew a self-hosted Go server
with accounts, drafts and a review queue. The goal is now a public, community
project for a wide audience: new graduates learning programming, a Class 9
CBSE student revising maths, a team onboarding a new hire. Most of the people
who could write those roadmaps (teachers, team leads, subject experts) do not
use git, and many of the people reading them are minors.

roadmap.sh proves the demand for structured learning paths, but is developer
focused and increasingly commercial. The differentiators here are depth per
node (description, FAQ, screenshots, changelog), non-developer subjects, and
content that is open in a way anyone can fork.

## Decision

1. **The GitHub repository is the only source of truth for published
   content.** Each roadmap is a folder, `roadmaps/<slug>/`, holding
   `roadmap.json` (the builder's document format, unchanged), `meta.json`
   (tags, audience, language, authors) and an `images/` folder.
2. **The public site is static**, built from the repository by GitHub Actions
   and served from GitHub Pages. There is no application server for readers.
3. **Learners have no accounts.** Progress is stored only in the learner's
   browser. We collect nothing about learners.
4. **Authors never touch git.** They write in the builder on the site, with
   drafts kept in their browser, and press Submit. A small submission service
   (a serverless function holding a GitHub App credential) verifies the
   author's email with a one-time code and opens a pull request on their
   behalf. Authors see a status, not a pull request.
5. **Author email addresses never enter the repository.** The repository
   records a display name and an optional profile link. The submission service
   keeps the email-to-roadmap mapping so an author can come back and edit.
6. **Every change is reviewed by a person before it is published.** Pull
   request checks validate the document, check links and limit images.
   Maintainers review on GitHub at first; per-subject curators get a review
   page on the site later, so they do not need GitHub either.
7. **Licensing is split.** Code is MIT. Roadmap content is CC BY-SA 4.0, so
   anyone may reuse and adapt it with attribution, under the same terms.
8. **The Go server moves to `selfhost/`** as a separate product for a school
   or company that wants a private instance. It is not part of the public
   site.

## Consequences

Good:

- Nothing to operate for readers: no database, no passwords, no uptime.
- No personal data about learners, which matters because many are children
  (India's DPDP Act requires verifiable parental consent for children's data).
- Full history, attribution and review come from git for free.
- The whole project, content included, can be forked by anyone.

Costs and risks:

- Progress does not follow a learner across devices. An export/import of
  progress is the mitigation.
- The submission service is a small piece of server code we still own:
  email delivery, rate limiting, a captcha and the GitHub App secret.
- Review capacity is the bottleneck. Spam is contained because nothing is
  published without review, but reviewers can still be flooded.
- The browser's localStorage is too small for drafts with screenshots; the
  builder's drafts must move to IndexedDB.

## Delivery order

1. Repository layout, validation, static site on GitHub Pages.
2. Builder on the site: drafts in IndexedDB, open and edit any published
   roadmap.
3. Submission service: email verification, pull request creation, status
   page, notification emails.
4. "Suggest a change" on any node, and a review page for curators.

## Alternatives considered

- **Pull requests by authors** (fork, edit, PR, or the GitHub web upload).
  Rejected as the main path because it excludes most non-developer authors.
  It remains available to anyone who prefers it.
- **The Go server as the public authoring hub, with GitHub as a mirror.**
  Most of it already exists, but it means operating accounts, password
  resets, backups and uptime for a volunteer project, and holding personal
  data about minors.
