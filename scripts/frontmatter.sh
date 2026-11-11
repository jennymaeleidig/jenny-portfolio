#!/usr/bin/env bash
# One reader for the frontmatter subset the site writes. The grammar is the
# one docs/project.md and docs/career.md describe: top-level scalars, lists of
# items, one level of mappings, and the links list, whose items carry a title
# and a url. Everything else is reported, never silently dropped, so the caller
# decides whether that is an error. This is also the one place the links
# grammar lives: a title and its url are single-quoted YAML scalars, so a title
# may carry any single-line text without needing a delimiter.

# Emit the frontmatter as tab-separated records, one per line:
#   scalar <key> <value>
#   item   <section> <value>
#   pair   <section> <subkey> <value>
#   link   <section> <title> <url>
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
    # A quoted YAML scalar. Either delimiter is accepted: single quotes double
    # an inner quote, while double quotes escape an inner quote or backslash
    # with a backslash. Returns the text and sets value_error when the scalar
    # is not one quoted line or carries a malformed inner quote.
    function quoted(s,   q, text, out, i, c, n) {
      s = trim(s)
      if (length(s) < 2) {
        value_error = 1
        return ""
      }
      q = substr(s, 1, 1)
      if ((q != "\047" && q != "\042") || substr(s, length(s), 1) != q) {
        value_error = 1
        return ""
      }
      text = substr(s, 2, length(s) - 2)
      out = ""
      for (i = 1; i <= length(text); i++) {
        c = substr(text, i, 1)
        if (q == "\047") {
          if (c == "\047") {
            if (substr(text, i + 1, 1) != "\047") {
              value_error = 1
              return ""
            }
            i++
          }
        } else if (c == "\042") {
          value_error = 1
          return ""
        } else if (c == "\\") {
          n = substr(text, i + 1, 1)
          if (n != "\\" && n != "\042") {
            value_error = 1
            return ""
          }
          c = n
          i++
        }
        out = out c
      }
      return out
    }
    # One field of a link record. The prefix names the field; everything after
    # it is the quoted scalar. Returns a sentinel when the scalar is malformed
    # or carries a control character, which strict YAML refuses.
    function link_value(line, prefix,   value) {
      value = line
      sub(prefix, "", value)
      value_error = 0
      value = quoted(value)
      if (value_error) return "\001"
      if (value ~ /[\001-\037\177]/) return "\001"
      return value
    }
    NR == 1 && $0 == "---" { capture = 1; next }
    capture && $0 == "---" { exit }
    !capture { next }
    {
      line = $0
      sub(/\r$/, "", line)
      if (line ~ /^[[:space:]]*(#|$)/) next

      # The links list is the one nested shape: a title line, then its url.
      # Both keys are indented with spaces, as the YAML shape requires.
      if (section == "links" && line ~ /^[[:space:]]*\t/) {
        print "invalid\t" line
        next
      }

      if (section == "links" && line ~ /^ +- +title:/ && line !~ /^ +- +title: +/) {
        print "invalid\t" line
        next
      }

      if (section == "links" && line ~ /^ +url:/ && line !~ /^ +url: +/) {
        print "invalid\t" line
        next
      }

      if (section == "links" && line ~ /^ +- +title: +/) {
        if (link_pending) {
          print "invalid\t" link_raw
          link_pending = 0
        }
        link_raw = line
        link_title = link_value(line, "^ +- +title: +")
        if (link_title == "\001" || link_title ~ /^[[:space:]]*$/) {
          print "invalid\t" link_raw
          next
        }
        link_pending = 1
        next
      }

      if (section == "links" && line ~ /^ +url: +/) {
        if (!link_pending) {
          print "invalid\t" line
          next
        }
        link_url = link_value(line, "^ +url: +")
        if (link_url == "\001") {
          print "invalid\t" line
          link_pending = 0
          next
        }
        print "link\tlinks\t" link_title "\t" link_url
        link_pending = 0
        link_title = ""
        link_raw = ""
        next
      }

      if (link_pending) {
        print "invalid\t" link_raw
        link_pending = 0
      }

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

      if (section != "" && line ~ /^[[:space:]]+[A-Za-z][A-Za-z0-9 ._-]*:[[:space:]]/) {
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
    END {
      if (link_pending) {
        print "invalid\t" link_raw
      }
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
