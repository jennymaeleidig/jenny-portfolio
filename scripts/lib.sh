#!/usr/bin/env bash
# Shared helpers for the build and its layouts.

# The single source of truth for the values staging accepts and layouts label.
STATUSES=(active shipped wip archived)
CATEGORIES=(games sound hardware web articles)
LINK_KINDS=(live repo itch paper video)

is_status() {
  local value
  for value in "${STATUSES[@]}"; do
    [[ $1 == "$value" ]] && return 0
  done
  return 1
}

is_link_kind() {
  local value
  for value in "${LINK_KINDS[@]}"; do
    [[ $1 == "$value" ]] && return 0
  done
  return 1
}

is_category() {
  local value
  for value in "${CATEGORIES[@]}"; do
    [[ $1 == "$value" ]] && return 0
  done
  return 1
}

html_escape() {
  printf '%s' "$1" | sed \
    -e 's/&/\&amp;/g' \
    -e 's/</\&lt;/g' \
    -e 's/>/\&gt;/g' \
    -e 's/"/\&quot;/g'
}

# A frontmatter scalar from a hand-written page, e.g. its photo or update date.
frontmatter_value() {
  awk -v want="$2" '
    NR == 1 && $0 == "---" { frontmatter = 1; next }
    frontmatter && $0 == "---" { exit }
    frontmatter {
      key = $0
      sub(/:.*/, "", key)
      if (key == want) {
        value = $0
        sub(/^[^:]*:[[:space:]]*/, "", value)
        sub(/^["\047]/, "", value)
        sub(/["\047]$/, "", value)
        print value
        exit
      }
    }
  ' "$1"
}

# Render a hand-written markdown page, dropping its frontmatter.
markdown_body() {
  awk '
    NR == 1 && $0 == "---" { frontmatter = 1; next }
    frontmatter && $0 == "---" { frontmatter = 0; next }
    !frontmatter { print }
  ' "$1" | cmark-gfm --extension table --extension autolink
}

status_label() {
  case $1 in
    wip) printf 'work in progress' ;;
    active) printf 'active' ;;
    shipped) printf 'shipped' ;;
    archived) printf 'archived' ;;
  esac
}

link_label() {
  case $1 in
    live) printf 'Live' ;;
    repo) printf 'Repo' ;;
    itch) printf 'itch.io' ;;
    paper) printf 'Paper' ;;
    video) printf 'Video' ;;
  esac
}

category_label() {
  case $1 in
    games) printf 'Games' ;;
    sound) printf 'Sound' ;;
    hardware) printf 'Hardware' ;;
    web) printf 'Web' ;;
    articles) printf 'Articles' ;;
  esac
}

# The outbound URL for an article, which has no page of its own.
article_href() {
  local entry key url paper='' live=''
  for entry in "$@"; do
    key=${entry%%=*}
    url=${entry#*=}
    case $key in
      paper) paper=$url ;;
      live) live=$url ;;
    esac
  done
  if [[ -n $paper ]]; then
    printf '%s' "$paper"
  else
    printf '%s' "$live"
  fi
}

# Emit the catalogue in its canonical order, one tab-separated record per
# project: pinned, order, year, slug, category, title, blurb (HTML), href,
# featured. A project with `order` sorts first, lowest number first, so it can
# be pinned above newer work; everything else follows by year, newest first.
# The slug breaks ties so the output is stable between builds.
project_records() {
  local meta pinned order href
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
      href="/projects/$META_SLUG/"
      if [[ $META_CATEGORY == articles ]]; then
        href=$(article_href ${META_LINKS[@]+"${META_LINKS[@]}"})
      fi
      printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
        "$pinned" "$order" "$META_YEAR" "$META_SLUG" "$META_CATEGORY" \
        "$META_TITLE" "${META_BLURB:-}" "$href" "${META_FEATURED:-false}"
    )
  done | LC_ALL=C sort -t $'\t' -k1,1n -k2,2n -k3,3nr -k4,4
}

# Emit the CV-visible projects in chronological order, newest first: year,
# title, CV blurb, href and category. The catalogue's pinning does not apply
# here, because the resume is the record rather than a showcase.
cv_project_records() {
  local meta href
  shopt -s nullglob
  for meta in "$META_DIR"/*.sh; do
    (
      # shellcheck source=/dev/null
      source "$meta"
      [[ ${META_CV:-false} == true ]] || exit 0
      href="/projects/$META_SLUG/"
      if [[ $META_CATEGORY == articles ]]; then
        href=$(article_href ${META_LINKS[@]+"${META_LINKS[@]}"})
      fi
      printf '%s\t%s\t%s\t%s\t%s\n' \
        "$META_YEAR" "$META_TITLE" "${META_CV_BLURB:-}" "$href" "$META_CATEGORY"
    )
  done | LC_ALL=C sort -t $'\t' -k1,1nr -k2,2
}

# List one resume section's entry files newest first, sorted by a frontmatter
# field such as `start` or `year`. The filename breaks ties so the order is
# stable between builds.
resume_files() {
  local dir=$1 field=$2 file key
  shopt -s nullglob
  for file in "$dir"/*.md; do
    key=$(frontmatter_value "$file" "$field")
    printf '%s\t%s\n' "${key:-0000}" "$file"
  done | LC_ALL=C sort -t $'\t' -k1,1r -k2,2 | cut -f2-
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

# A resume date is a year, a year and month, or `present`. Anything else is
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
