# Links are titled records

_Superseded in part by [ADR-0004](0004-links-accept-either-quote-style.md):
both fields may be double-quoted as well._

A project's `links:` field is a list of `title`/`url` records, not a mapping of
label to URL. Both fields are single-quoted YAML scalars:

```yaml
links:
  - title: 'Dreamcast: Repair'
    url: 'https://example.com/dreamcast'
```

## Why

The old mapping made a link's key do two jobs: it was the printed text and it
was parsed as a YAML key. That forced a key grammar on the writer, so a title
with a colon, an apostrophe, parentheses, a leading digit or a non-ASCII letter
could not be written at all. A colon looked like a delimiter; `#` at the start
of a line vanished as a comment. The form also could not carry two links with
the same title.

A titled record separates the two jobs. The title is a value, so it needs no
delimiter and no vocabulary. Single-quoting both fields keeps the link block
strict YAML and makes the parser's job small: strip the outer quotes, turn `''`
into `'`, and reject anything that is not one quoted line. The parser accepts
the shape the site writes, not every YAML spelling of it: indentation is
spaces, a trailing comment after a value is not supported, and control
characters are refused.

The old fixed `LINK_KINDS` table (`live`, `repo`, `itch`, `paper`, `video`) was
already removed before this decision. This ADR finishes the job by removing the
key grammar that replaced it.

## Consequences

- A link title prints verbatim. There is no capitalisation step, so `itch.io`
  and `eBay` keep their case.
- Order is file order; duplicate titles are allowed.
- A title is one line and may not contain a tab, newline or other control
  character.
- The old mapping form is refused with a message pointing at this shape.
- Articles keep their `publication` URL and have no page, so their `links` list
  is not rendered; `publication` remains the article's external link.
- The parser stays inside the bash 3.2 floor: links are read as records, and
  staging writes one `title<TAB>url` array rather than an associative map.
- Sidecar values are single-quoted in shell rather than written with `%q`:
  bash 3.2 leaves a leading tilde bare, so a title like `~ notes` would expand
  when the sidecar is sourced.

## Rejected alternatives

- **Keep the mapping and allow quoted keys.** Duplicate titles remain
  impossible, and every title with punctuation needs escaping.
- **Split each link on a delimiter.** No delimiter can be absent from an
  arbitrary title.
- **Allow unquoted raw titles.** Convenient, but the file would stop being
  strict YAML as soon as a title contained `: `.
