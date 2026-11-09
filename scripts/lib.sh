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
