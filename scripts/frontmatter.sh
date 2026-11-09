#!/usr/bin/env bash
# One reader for the frontmatter subset the site writes. The grammar is the
# one docs/project.md and docs/career.md describe: top-level scalars, lists of
# items, and one level of mappings. Everything else is reported, never silently
# dropped, so the caller decides whether that is an error.

# Emit the frontmatter as tab-separated records, one per line:
#   scalar <key> <value>
#   item   <section> <value>
#   pair   <section> <subkey> <value>
#   invalid <line>
# A line before the closing delimiter that fits none of those shapes is
# reported as invalid rather than skipped.
frontmatter_records() {
  awk '
    function trim(s) {
      sub(/^[[:space:]]+/, "", s)
      sub(/[[:space:]]+$/, "", s)
      return s
    }
    function unquote(s) {
      s = trim(s)
      if (s ~ /^".*"$/ || s ~ /^\047.*\047$/) {
        s = substr(s, 2, length(s) - 2)
      }
      return s
    }
    NR == 1 && $0 == "---" { capture = 1; next }
    capture && $0 == "---" { exit }
    !capture { next }
    {
      line = $0
      sub(/\r$/, "", line)
      if (line ~ /^[[:space:]]*(#|$)/) next

      if (line ~ /^[A-Za-z_][A-Za-z0-9_]*:[[:space:]]*$/) {
        section = line
        sub(/:.*/, "", section)
        next
      }

      if (line ~ /^[A-Za-z_][A-Za-z0-9_]*:[[:space:]]/) {
        key = line
        sub(/:.*/, "", key)
        value = line
        sub(/^[^:]*:[[:space:]]*/, "", value)
        if (key == "tags" && value ~ /^\[.*\]$/) {
          count = split(substr(value, 2, length(value) - 2), parts, ",")
          for (i = 1; i <= count; i++) {
            tag = unquote(parts[i])
            if (tag != "") print "item\ttags\t" tag
          }
        } else {
          print "scalar\t" key "\t" unquote(value)
        }
        section = ""
        next
      }

      if (section != "" && line ~ /^[[:space:]]+-[[:space:]]+/) {
        value = line
        sub(/^[[:space:]]+-[[:space:]]+/, "", value)
        print "item\t" section "\t" unquote(value)
        next
      }

      if (section != "" && line ~ /^[[:space:]]+[A-Za-z_][A-Za-z0-9_]*:[[:space:]]/) {
        subkey = line
        sub(/^[[:space:]]+/, "", subkey)
        sub(/:.*/, "", subkey)
        value = line
        sub(/^[[:space:]]+[^:]*:[[:space:]]*/, "", value)
        print "pair\t" section "\t" subkey "\t" unquote(value)
        next
      }

      print "invalid\t" line
    }
  ' "$1"
}

# Emit the top-level scalars as <key><TAB><value> records. Multi-field callers
# read this stream once into locals instead of asking for each key in turn.
frontmatter_scalars() {
  frontmatter_records "$1" | awk -F'\t' '$1 == "scalar" { print $2 "\t" $3 }'
}

# One frontmatter scalar, for callers that want a single fact. Empty when the
# key is not there.
frontmatter_value() {
  frontmatter_scalars "$1" | awk -F'\t' -v want="$2" '$1 == want { print $2; exit }'
}

# A page's body, dropping its frontmatter.
frontmatter_body() {
  awk '
    NR == 1 && $0 == "---" { frontmatter = 1; next }
    frontmatter && $0 == "---" { frontmatter = 0; next }
    !frontmatter { print }
  ' "$1"
}
