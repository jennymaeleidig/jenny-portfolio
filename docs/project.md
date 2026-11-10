# Project files

One file per project: `content/projects/<slug>.md`. The filename is the URL, so
it must match `^[a-z0-9-]+$`.

```yaml
---
year: <YYYY>
status: <status>
category: <category>
cover: /assets/projects/<slug>/cover.png
tags:
  - <tag>
links:
  - title: '<title>'
    url: '<url>'
featured: true
order: <n>
---
```

## Fields

`year`, `status` and `category` are required; the rest are optional.

- `year` — `YYYY`. Dates the page and orders the catalogue.
- `status` — `active`, `shipped`, `wip`, `archived`, `study`. `wip` prints "work
  in progress". `wip` is work still to ship; `study` is work made to explore a
  technique, mood or mechanic, with nothing pending.
- `category` — `games`, `sound`, `hardware`, `software`, `articles`. Each
  builds `/work/<category>/`. `articles` has no page of its own: its catalogue
  row links straight out, so it needs a `publication`.
- `cover` — absolute from `/`, and the file must exist. Project images live
  under `assets/projects/<slug>/`. Export them by hand; the build does no image
  processing.
- `tags` — free-form. The only place tools and techniques are named.
- `links` — a list of titled `http(s)` links, printed in the order written.
  Each link has a `title` and a `url`, both single-quoted YAML scalars. There
  is no default set and no vocabulary: write the title exactly as it should
  print, and its case is kept. A title is non-empty single-line text, including
  colons, apostrophes, parentheses, `#`, `=`, and Unicode; a single quote inside
  one is written twice. A title of only spaces is empty. Tabs, newlines and
  other control characters are rejected. Duplicate titles are allowed, and one
  link does not need a different title from another. Indent the `- title:` and
  `url:` lines with spaces, as in the example; put comments on their own line,
  not after a quoted value.

  ```yaml
  links:
    - title: 'Play it'
      url: 'https://example.com/play'
    - title: 'Dreamcast: Repair'
      url: 'https://example.com/dreamcast'
    - title: 'Jenny''s "Final" Cut (#1)'
      url: 'https://example.com/final'
  ```

  The mapping form this field used to take (`Repo: <url>`) is refused; the
  build names the file and points here.
- `publication` — where an article was published, an `http(s)` URL. Required
  by `articles`, refused on anything else. An article has no page of its own,
  so its catalogue row links out through `publication`; links are rendered on
  project pages only.

```yaml
---
year: 2026
status: shipped
category: articles
publication: <url>
---
```
- `order` — integer. Pins the project above the catalogue, lowest first.
- `featured` — `true` puts it on the front page as a card. Six is the number
  the page is designed around.

`scripts/stage.sh` fails the build naming the file on an unknown key or value, a
missing required field, a missing cover, a `publication` on a project that
should have a page, a link that is not a title/url pair, a title or URL that is
not a single-quoted YAML scalar, a link URL that is not `http(s)`, or a filename
jenny can't `eval`.

## Vocabulary

The words `status` and `category` accept are not in the build script. They live
at the repository root, in `vocabulary/` — build vocabulary, not content, so it
sits still when `CONTENT_DIR` points a test at another directory. One file per
domain, in canonical order:

```
statuses          active, shipped, wip, archived, study
categories        games, sound, hardware, software, articles
career-sections   experience, volunteering, education, skills
```

Each line is `word=Label`, where the label is what the page prints. `#` starts a
comment. Adding a status or category word is a one-line change here and needs no
code; the build reads the files, so the catalogue tabs, the category routes and
`scripts/stage.sh`'s validation all follow. Order in a file is the order the
site shows: the catalogue's category filter and the career tabs both read it.

The exception is `articles`, which the build treats specially — no page of its
own, a `publication` instead — so a category that should behave like an article
is a code change, not a line here.

## Body

The first line is `# Title`. The title is the H1 rather than frontmatter because
jenny reads the H1.

The first paragraph is the blurb: the catalogue row and the featured card. Write
it to stand alone.

The rest is the page's prose, in CommonMark plus tables and autolinks.
