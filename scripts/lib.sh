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

# Render a hand-written markdown page, dropping its frontmatter.
markdown_body() {
  frontmatter_body "$1" | cmark-gfm --extension table --extension autolink
}

# Emit the catalogue in its canonical order, one slug per line. A project
# with `order` sorts first, lowest number first, so it can be pinned above
# newer work; everything else follows by year, newest first. The slug breaks
# ties so the output is stable between builds. Callers read a row's facts from
# its sidecar by name.
project_records() {
  local meta pinned order
  shopt -s nullglob
  for meta in "$META_DIR"/*.sh; do
    (
      # shellcheck source=/dev/null
      source "$meta"
      pinned=1
      order=0
      if [[ -n ${META_ORDER:-} ]]; then
        pinned=0
        order=$META_ORDER
      fi
      printf '%s\t%s\t%s\t%s\n' \
        "$pinned" "$order" "$META_YEAR" "$META_SLUG"
    )
  done | LC_ALL=C sort -t $'\t' -k1,1n -k2,2n -k3,3nr -k4,4 | cut -f4
}

# List one career section's entry files newest first, sorted by a frontmatter
# field such as `start` or `year`. The filename breaks ties so the order is
# stable between builds.
career_files() {
  local dir=$1 field=$2 file key
  shopt -s nullglob
  for file in "$dir"/*.md; do
    key=$(frontmatter_value "$file" "$field")
    printf '%s\t%s\n' "${key:-0000}" "$file"
  done | LC_ALL=C sort -t $'\t' -k1,1r -k2,2 | cut -f2-
}

# Emit the entries of a career section grouped by one frontmatter field, newest
# first within each group, as a record stream: a `group` record naming the
# employer or organisation and its location, then one `file` record per entry,
# then an `end` record. Grouping is by identity rather than adjacency, so two
# stints at the same employer stay together even when another role is dated
# between them.
career_group_records() {
  local dir=$1 field=$2
  local -a groups=()
  local -a group_files=()
  local file group first location
  local i found

  while IFS= read -r file; do
    [[ -n $file ]] || continue
    group=$(frontmatter_value "$file" "$field")
    found=-1
    for ((i = 0; i < ${#groups[@]}; i++)); do
      if [[ ${groups[i]} == "$group" ]]; then
        found=$i
        break
      fi
    done
    if ((found < 0)); then
      groups+=("$group")
      group_files+=("$file")
    else
      group_files[found]+=$'\n'"$file"
    fi
  done < <(career_files "$dir" start)

  for ((i = 0; i < ${#groups[@]}; i++)); do
    group=${groups[i]}
    first=${group_files[i]%%$'\n'*}
    location=$(frontmatter_value "$first" location)
    printf 'group\t%s\t%s\n' "$group" "$location"
    while IFS= read -r file; do
      [[ -n $file ]] || continue
      printf 'file\t%s\n' "$file"
    done <<< "${group_files[i]}"
    printf 'end\n'
  done
}

# Emit education entries newest first, one tab-separated record per entry:
# institution, location, degree, start, end, note.
career_education_records() {
  local dir=$1 file key value
  local institution location degree start end note
  while IFS= read -r file; do
    [[ -n $file ]] || continue
    institution='' location='' degree='' start='' end='' note=''
    while IFS=$'\t' read -r key value; do
      case $key in
        institution) institution=$value ;;
        location) location=$value ;;
        degree) degree=$value ;;
        start) start=$value ;;
        end) end=$value ;;
        note) note=$value ;;
      esac
    done < <(frontmatter_scalars "$file")
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
      "$institution" "$location" "$degree" "$start" "$end" "$note"
  done < <(career_files "$dir" start)
}

# Emit the skills list as records: one tab-separated `category skill` line per
# skill. Each category is a bullet of the hand-written skills.md of the form
# `- **Category:** skill, skill, ...`; a comma inside parentheses, as in
# `AWS (S3, EMR, DynamoDB)`, is part of one skill rather than a separator.
career_skill_records() {
  local file=$1
  awk '
    function trim(text) {
      sub(/^[[:space:]]+/, "", text)
      sub(/[[:space:]]+$/, "", text)
      return text
    }
    # Split on commas that sit outside parentheses, so grouped skills survive.
    function emit(items,   i, char, depth, buffer) {
      depth = 0
      buffer = ""
      for (i = 1; i <= length(items); i++) {
        char = substr(items, i, 1)
        if (char == "(") depth++
        if (char == ")" && depth > 0) depth--
        if (char == "," && depth == 0) {
          if (trim(buffer) != "") print category "\t" trim(buffer)
          buffer = ""
          continue
        }
        buffer = buffer char
      }
      if (trim(buffer) != "") print category "\t" trim(buffer)
    }
    /^- \*\*/ {
      line = $0
      sub(/^- \*\*/, "", line)
      category = line
      sub(/:\*\*.*/, "", category)
      items = line
      sub(/^.*:\*\*[[:space:]]*/, "", items)
      emit(items)
    }
  ' "$file"
}

month_label() {
  case ${1#*-} in
    01) printf 'January' ;;
    02) printf 'February' ;;
    03) printf 'March' ;;
    04) printf 'April' ;;
    05) printf 'May' ;;
    06) printf 'June' ;;
    07) printf 'July' ;;
    08) printf 'August' ;;
    09) printf 'September' ;;
    10) printf 'October' ;;
    11) printf 'November' ;;
    12) printf 'December' ;;
  esac
}

# A career date is a year, a year and month, or `present`. Anything else is
# shown as it was written rather than silently dropped.
date_label() {
  case $1 in
    "" | present | Present) printf 'Present' ;;
    [0-9][0-9][0-9][0-9]) printf '%s' "$1" ;;
    [0-9][0-9][0-9][0-9]-[0-9][0-9]) printf '%s %s' "$(month_label "$1")" "${1%%-*}" ;;
    *) printf '%s' "$1" ;;
  esac
}

date_range() {
  local start=$1 end=$2
  printf '%s – %s' "$(date_label "$start")" "$(date_label "$end")"
}
