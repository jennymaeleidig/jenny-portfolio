#!/usr/bin/env bash
# The route table: every page the build emits, with the address it declares.
#
# One record drives both jobs that used to derive addresses separately: the
# renderer walks it to produce output, and the sitemap walks it to publish
# locs. A route is a page, so it carries what renders it as well as where it
# lives. An article has no page, so the project record's publishability rule
# keeps it out of the table rather than leaving a second check in the renderer.
#
# Records are unit-separated, the same as the project and career modules:
#
#   address <output> <indexable> <kind> <layout> <argument> <source>
#
# `indexable=false` means the page claims no canonical URL and does not appear
# in the sitemap (the 404). `kind` is `layout` for a page rendered through a
# layout, or `project` for a page jenny rendered and the build relocates.

# shellcheck source=/dev/null
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/projects.sh"

route_known_field() {
  case $1 in
    address | output | indexable | kind | layout | argument | source) return 0 ;;
    *)
      echo "error: unknown route field '$1'" >&2
      return 1
      ;;
  esac
}

# One route's named fields, unit-separated.
route_row() {
  local address=$1 output=$2 indexable=$3 kind=$4 layout=$5 argument=$6 source=$7
  shift 7
  local field value first=1
  for field in "$@"; do
    case $field in
      address) value=$address ;;
      output) value=$output ;;
      indexable) value=$indexable ;;
      kind) value=$kind ;;
      layout) value=$layout ;;
      argument) value=$argument ;;
      source) value=$source ;;
    esac
    if ((first)); then
      first=0
    else
      printf '\037'
    fi
    printf '%s' "$value"
  done
  printf '\n'
}

# Where an address's page lands under DIST.
route_output() {
  local address=$1
  if [[ $address == / ]]; then
    printf '%s/index.html' "${DIST%/}"
  else
    printf '%s%s/index.html' "${DIST%/}" "${address%/}"
  fi
}

# Emit the route table once. Callers name the fields they need: the renderer
# asks for the render kind and source, the sitemap for the address and
# indexability.
route_records() {
  local -a fields=("$@")
  local field category section slug publishable
  for field in "${fields[@]}"; do
    route_known_field "$field" || return 1
  done

  route_row / "$(route_output /)" true layout home "" "" "${fields[@]}"
  route_row /work/ "$(route_output /work/)" true layout work "" "" "${fields[@]}"

  while IFS= read -r category; do
    route_row "/work/$category/" "$(route_output "/work/$category/")" true \
      layout work "$category" "" "${fields[@]}"
  done < <(vocabulary_words categories)

  route_row /work/career/ "$(route_output /work/career/)" true layout career "" "" "${fields[@]}"

  while IFS= read -r section; do
    route_row "/work/career/$section/" "$(route_output "/work/career/$section/")" true \
      layout career "$section" "" "${fields[@]}"
  done < <(vocabulary_words career-sections)

  route_row /about/ "$(route_output /about/)" true layout about "" "" "${fields[@]}"
  route_row /now/ "$(route_output /now/)" true layout now "" "" "${fields[@]}"

  # The 404 is a page with no address to claim: it answers unknown paths and
  # asks not to be indexed.
  route_row /404/ "$(route_output /404/)" false layout 404 "" "" "${fields[@]}"

  while IFS=$'\037' read -r slug publishable; do
    [[ $publishable == true ]] || continue
    route_row "/projects/$slug/" "$(route_output "/projects/$slug/")" true \
      project "" "" "${DIST%/}/post/$slug.html" "${fields[@]}"
  done < <(project_records slug publishable)
}
