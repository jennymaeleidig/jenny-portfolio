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
  row links straight out, so it needs a `paper` or `live` link.
- `cover` — absolute from `/`, and the file must exist. Project images live
  under `assets/projects/<slug>/`. Export them by hand; the build does no image
  processing.
- `tags` — free-form. The only place tools and techniques are named.
- `links` — `live`, `repo`, `itch`, `paper`, `video`, each an `http(s)` URL,
  printed in the order written. When a project carries two links of the same
  sort, title the extras instead of repeating a kind: a key that starts with a
  capital is the link's own text, so `Frontend:` and `Backend:` can sit
  alongside `live:`. A title is capitalised words of letters, digits, spaces,
  hyphens and underscores — no punctuation, since the colon that ends the key
  is the delimiter. Lowercase typos (`rep:`) stay an error; a capitalised one
  (`Repo:`) reads as a title, so the label is printed as written.
- `order` — integer. Pins the project above the catalogue, lowest first.
- `featured` — `true` puts it on the front page as a card. Six is the number
  the page is designed around.

`scripts/stage.sh` fails the build naming the file on an unknown key or value, a
missing required field, a missing cover, or a filename jenny can't `eval`.

## Body

The first line is `# Title`. The title is the H1 rather than frontmatter because
jenny reads the H1.

The first paragraph is the blurb: the catalogue row and the featured card. Write
it to stand alone.

The rest is the page's prose, in CommonMark plus tables and autolinks.
