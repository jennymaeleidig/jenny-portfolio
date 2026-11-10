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
  itch: <url>
  repo: <url>
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
- `links` — a mapping of label to `http(s)` URL, printed in the order written.
  The key is the text the link prints as, so there is no vocabulary to learn:
  write `Live:`, `Repo:`, `Itch.io:`, or `Program doc:` and that is what the
  page shows. A label is letters, digits, spaces, hyphens, underscores and
  dots, and it may not contain a colon, which ends it.
- `publication` — where an article was published, an `http(s)` URL. Required
  by `articles`, refused on anything else.
- `order` — integer. Pins the project above the catalogue, lowest first.
- `featured` — `true` puts it on the front page as a card. Six is the number
  the page is designed around.

`scripts/stage.sh` fails the build naming the file on an unknown key or value, a
missing required field, a missing cover, a `publication` on a project that
should have a page, or a filename jenny can't `eval`.

## Vocabulary

The words `status` and `category` accept are not in the build script. They live
in `vocabulary/`, one file per domain, in canonical order:

```
statuses          active, shipped, wip, archived, study
categories        games, sound, hardware, software, articles
career-sections   experience, volunteering, education, skills
```

Each line is `word=Label`, where the label is what the page prints. `#` starts a
comment. Adding a word is a one-line change here and needs no code; the build
reads the files, so the catalogue tabs, the category routes and
`scripts/stage.sh`'s validation all follow. Order in a file is the order the
site shows: the catalogue's category filter and the career tabs both read it.

## Body

The first line is `# Title`. The title is the H1 rather than frontmatter because
jenny reads the H1.

The first paragraph is the blurb: the catalogue row and the featured card. Write
it to stand alone.

The rest is the page's prose, in CommonMark plus tables and autolinks.
