# Links accept either YAML quote style

A link's `title` and `url` are quoted YAML scalars. The house style is single
quotes, but the parser also reads double quotes, decoding `\"` and `\\`:

```yaml
links:
  - title: "Alan Zucconi's Journey"
    url: "https://example.com/alan"
```

## Why

The site is edited with Prettier's format-on-save. Prettier quotes a scalar
with whichever delimiter needs fewer escapes, so a title containing an
apostrophe but no double quote becomes `"Alan Zucconi's Journey"`. Under
ADR-0002's single-quote-only grammar that file stopped parsing the moment it was
saved, and `make build` refused it. An editor setting is not a fix: the file
itself is still strict YAML, and the parser should read the shape the YAML
toolchain writes.

Double-quoted scalars are decoded rather than merely stripped. Stripping the
outer quotes would leave `\"` in a title that contains a double quote, printing
a backslash the writer never typed.

## Consequences

- A link may be written in either quote style; Prettier keeps the single-quoted
  form whenever the text allows it.
- In a double-quoted value, only `\"` and `\\` are escapes. Anything else is a
  parse error, because a link is one line of plain text rather than a carrier
  for control characters.
- The control-character check now covers every C0 character and DEL, including
  a newline introduced by an escape. This closes a hole where a decoded newline
  could reach the TAB-separated record stream.
- The parser still accepts the shape the site writes, not every YAML spelling:
  indentation is spaces, a trailing comment after a value is not supported, and
  `\u`-style escapes are refused.

## Rejected alternatives

- **Single quotes only, enforced by Prettier.** Prettier still chooses double
  quotes when that needs fewer escapes, so apostrophes in titles keep breaking.
- **Strip either delimiter without decoding escapes.** A title containing a
  quote would print the escape characters.
- **Accept unquoted scalars.** A title containing `: ` would stop being YAML.
