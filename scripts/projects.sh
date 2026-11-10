#!/usr/bin/env bash
# A project's staged facts, read by name.
#
# stage.sh writes one sidecar per project; that sidecar is this module's
# storage, not a caller's interface. A layout asks for the facts it prints and
# never sources the sidecar or names a META_ variable. The catalogue order
# lives here too, because it is part of what a project record is: pinned
# projects first, then by year, newest first, with the slug breaking ties.
#
# A row's fields are joined with the unit separator rather than a tab: a
# project may omit a middle field (no cover, no order), and bash's `read`
# collapses consecutive tab delimiters. Links are a title<TAB>url record
# stream, as ADR-0002 requires; stage.sh refuses a title containing a tab, so
# the tab is the link's own field boundary.

# shellcheck source=/dev/null
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

# Whether a field is part of the record. Lists have their own accessors.
project_known_field() {
  case $1 in
    slug | title | blurb | blurb_text | year | status | category | cover | order | publication | featured | publishable | href)
      return 0
      ;;
    links | tags)
      echo "error: '$1' is a record stream; use project_$1 <slug>" >&2
      return 1
      ;;
    *)
      echo "error: unknown project field '$1'" >&2
      return 1
      ;;
  esac
}

# One field of an already-sourced sidecar. The caller has checked the name.
project_field_value() {
  case $1 in
    slug) printf '%s' "${META_SLUG:-}" ;;
    title) printf '%s' "${META_TITLE:-}" ;;
    blurb) printf '%s' "${META_BLURB:-}" ;;
    blurb_text)
      local text
      text=$(printf '%s\n' "${META_BLURB:-}" | prose_text)
      printf '%s' "$text"
      ;;
    year) printf '%s' "${META_YEAR:-}" ;;
    status) printf '%s' "${META_STATUS:-}" ;;
    category) printf '%s' "${META_CATEGORY:-}" ;;
    cover) printf '%s' "${META_COVER:-}" ;;
    order) printf '%s' "${META_ORDER:-}" ;;
    publication) printf '%s' "${META_PUBLICATION:-}" ;;
    featured) printf '%s' "${META_FEATURED:-}" ;;
    href)
      if [[ ${META_CATEGORY:-} == articles ]]; then
        printf '%s' "${META_PUBLICATION:-}"
      else
        printf '/projects/%s/' "${META_SLUG:-}"
      fi
      ;;
    publishable)
      if [[ ${META_CATEGORY:-} == articles ]]; then
        printf 'false'
      else
        printf 'true'
      fi
      ;;
  esac
}

# Emit every project in catalogue order, one row of the named fields joined
# with the unit separator. A caller names what it prints; it never learns the
# sidecar's shape.
project_records() {
  local -a fields=("$@")
  local field meta
  for field in "${fields[@]}"; do
    project_known_field "$field" || return 1
  done

  shopt -s nullglob
  for meta in "$META_DIR"/*.sh; do
    (
      # shellcheck source=/dev/null
      source "$meta"
      local pinned=1 order=0
      if [[ -n ${META_ORDER:-} ]]; then
        pinned=0
        order=$META_ORDER
      fi
      printf '%s\t%s\t%s\t%s' \
        "$pinned" "$order" "${META_YEAR:-}" "${META_SLUG:-}"
      printf '\t'
      for field in "${fields[@]}"; do
        printf '\037%s' "$(project_field_value "$field")"
      done
      printf '\n'
    )
  done | LC_ALL=C sort -t $'\t' -k1,1n -k2,2n -k3,3nr -k4,4 | cut -f5- | sed $'s/^\037//'
}

# One project's sidecar path, or a named error. The storage stays private to
# the module; every accessor crosses this guard.
project_meta() {
  local meta="$META_DIR/$1.sh"
  if [[ ! -f $meta ]]; then
    echo "error: no project metadata for $1" >&2
    return 1
  fi
  printf '%s' "$meta"
}

# Emit one project's named facts as one unit-separated row.
project_show() {
  local slug=$1
  shift
  local meta field first=1
  meta=$(project_meta "$slug") || return 1
  for field in "$@"; do
    project_known_field "$field" || return 1
  done
  (
    # shellcheck source=/dev/null
    source "$meta"
    for field in "$@"; do
      if ((first)); then
        first=0
      else
        printf '\037'
      fi
      project_field_value "$field"
    done
    printf '\n'
  )
}

# A project's links as title<TAB>url records, in file order.
project_links() {
  local meta entry
  meta=$(project_meta "$1") || return 1
  (
    # shellcheck source=/dev/null
    source "$meta"
    for entry in "${META_LINKS[@]}"; do
      printf '%s\n' "$entry"
    done
  )
}

# A project's tags, one per line, in file order.
project_tags() {
  local meta tag
  meta=$(project_meta "$1") || return 1
  (
    # shellcheck source=/dev/null
    source "$meta"
    for tag in "${META_TAGS[@]}"; do
      printf '%s\n' "$tag"
    done
  )
}
