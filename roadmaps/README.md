# Roadmaps

Every published roadmap is a folder here. The folder name is the roadmap's
address on the site (`/r/<folder>`), so pick it with care and do not rename it
once published: links, bookmarks and readers' saved progress depend on it.

```
roadmaps/
  cbse-class-9-maths/
    roadmap.json     the roadmap itself
    meta.json        who it is for, tags, language, authors
    images/          screenshots used by roadmap.json (optional)
```

All content in this folder is licensed under CC BY-SA 4.0 (see `LICENSE`).

## roadmap.json

The same format `tools/roadmap-builder.html` exports.

```json
{
  "title": "CBSE Class 9 Maths",
  "subtitle": "Every chapter, in an order that builds on itself.",
  "updated": "2026-10-19",
  "changelog": [{ "date": "2026-10-19", "text": "First version." }],
  "topics": [
    {
      "id": "numbers",
      "label": "Number systems",
      "desc": "Milestone: you can place any real number on the number line.",
      "links": [],
      "children": [
        {
          "id": "irrationals",
          "label": "Irrational numbers",
          "type": "core",
          "desc": "Why √2 cannot be written as p/q, and how to prove it.",
          "links": [{ "label": "NCERT Class 9, chapter 1", "url": "https://ncert.nic.in/textbook.php" }],
          "faq": [{ "q": "Is 22/7 equal to π?", "a": "No. 22/7 is a rational approximation." }],
          "images": [{ "src": "images/number-line.png", "caption": "√2 on the number line" }],
          "children": []
        }
      ]
    }
  ]
}
```

- **topics** are milestones on the spine. Their **children** are the steps to
  reach them, nested up to four levels.
- **id** is the step's permanent deep link and the key for readers' saved
  progress. Unique within the roadmap; 1–40 letters, digits, `-` or `_`.
  Never reuse an id for a different step.
- **type**: `core` (required), `alt` (a swap for a sibling) or `optional`.
- **desc**, FAQ answers and changelog text use a small markdown dialect:
  `**bold**`, `*italic*`, `` `code` ``, `[label](url)`, `- ` bullets and
  triple-backtick code blocks.
- **links** must be `http(s)` URLs. Prefer free, primary sources; mark
  anything paid as such in its label.
- **images** are `images/<file>` in this folder (png, jpg, webp or gif,
  500 KB at most, lowercase file names) or an `https://` URL. No inline
  `data:` images.

## meta.json

```json
{
  "audience": "Class 9 students revising for the final exam",
  "level": "beginner",
  "lang": "en",
  "tags": ["maths", "cbse", "class 9"],
  "authors": [{ "name": "A. Teacher", "url": "https://example.org/profile" }],
  "license": "CC-BY-SA-4.0"
}
```

| Field | Required | Notes |
|---|---|---|
| `audience` | yes | Who this is for, in one line. Shown on the card and the page. |
| `level` | no | `beginner`, `intermediate`, `advanced` or `all` |
| `lang` | yes | Language code: `en`, `hi`, `ta`, `bn`… |
| `tags` | yes | 1–8 lowercase tags, used for browsing |
| `authors` | yes | Display name and an optional link. Never an email address. |
| `license` | yes | Always `CC-BY-SA-4.0` |

## Checking your work

```
node site/scripts/validate.mjs
```

The same check runs on every pull request, along with a link checker.
