#!/usr/bin/env bash
# Shared helpers for the build and its layouts.

# shellcheck source=/dev/null
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/frontmatter.sh"

# Vocabulary lives in files, not in this script: one file per domain under
# vocabulary/, holding "word=Label" lines in canonical order. A word is
# declared once, so its membership, its label and its place cannot drift
# apart, and adding one is a content change.
vocabulary_dir=${VOCABULARY_DIR:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)/vocabulary}

# Every vocabulary function takes the domain first, then the word: the domain
# names the file, and the word is what a page or a frontmatter field carries.

# The entries of a domain, comments and blank lines dropped.
vocabulary_entries() {
  sed -e 's/#.*//' -e 's/[[:space:]]*$//' -e '/^$/d' "$vocabulary_dir/$1"
}

# The words of a domain, in canonical order.
vocabulary_words() {
  vocabulary_entries "$1" | cut -d= -f1
}

# Whether a word belongs to a domain.
vocabulary_has() {
  vocabulary_words "$1" | grep -qxF -- "$2"
}

# The label for a word in a domain; empty when the word is not there.
vocabulary_label() {
  vocabulary_entries "$1" | awk -F= -v word="$2" '$1 == word { sub(/^[^=]*=/, ""); print; exit }'
}

# Quote one value for a sourceable sidecar. printf's %q leaves a leading
# tilde bare in bash 3.2, so a title beginning with ~ would expand when the
# sidecar is sourced; single quotes stop every expansion. A quote inside is
# written as the usual close/escape/reopen sequence.
shell_quote() {
  local text=$1 out="'" c i
  for ((i = 0; i < ${#text}; i++)); do
    c=${text:i:1}
    if [[ $c == "'" ]]; then
      out+="'\\''"
    else
      out+=$c
    fi
  done
  printf "%s'" "$out"
}

html_escape() {
  printf '%s' "$1" | sed \
    -e 's/&/\&amp;/g' \
    -e 's/</\&lt;/g' \
    -e 's/>/\&gt;/g' \
    -e 's/"/\&quot;/g'
}

# The attribute marking the current page in a link bar, or nothing when the
# link is not the current one.
current_page_attr() {
  if [[ $1 == "$2" ]]; then
    printf ' aria-current="page"'
  fi
}

# Whether a string is an http(s) URL, the only thing a link may point at.
is_http_url() {
  [[ $1 =~ ^https?://[^[:space:]]+$ ]]
}

# The parser and the GFM extensions the site pins, in one place. jenny reads
# the command as a string, so the build exports it from this array; the
# layouts and the staging step call render_markdown and never spell it.
MARKDOWN=(cmark-gfm --extension table --extension autolink)
MARKDOWN_COMMAND="${MARKDOWN[*]}"

# Render markdown from stdin.
render_markdown() {
  "${MARKDOWN[@]}"
}

# Render a hand-written markdown page, dropping its frontmatter.
markdown_body() {
  frontmatter_body "$1" | render_markdown
}

# Rendered prose as a plain string: markup stripped, whitespace folded, and the
# entities cmark writes put back. A meta tag needs raw text it escapes once, so
# undoing the parser's escaping here is what keeps `&` from becoming `&amp;amp;`.
prose_text() {
  awk '
    { text = text " " $0 }
    END {
      gsub(/<[^>]*>/, "", text)
      # The parser escapes these four; undo them before the amp entity, so an
      # escaped `&lt;` in the source comes back as the text it was written to be.
      gsub(/&lt;/, "<", text)
      gsub(/&gt;/, ">", text)
      gsub(/&quot;/, "\"", text)
      gsub(/&amp;/, "\\&", text)
      gsub(/[[:space:]]+/, " ", text)
      sub(/^ /, "", text)
      sub(/ $/, "", text)
      print text
    }
  '
}

# The opening paragraph of a markdown body: the text after an optional H1,
# up to the next blank line. The rule lives on the source, so a project's
# blurb and About's description cannot extract it differently.
opening_paragraph() {
  awk '
    !started && /^#[[:space:]]/ { started = 1; next }
    !started && /^[[:space:]]*$/ { next }
    !started { started = 1 }
    started && /^[[:space:]]*$/ { if (text != "") exit; next }
    started { text = (text == "" ? $0 : text " " $0) }
    END { print text }
  '
}

# The opening paragraph of a markdown file, dropping its frontmatter.
lead_paragraph() {
  frontmatter_body "$1" | opening_paragraph
}
