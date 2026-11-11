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

# One project page's route. post.sh names its own address while jenny renders
# it, so it asks this function rather than spelling the path a second time.
project_route() {
  local slug=$1
  shift
  local -a fields=("$@")
  local field address output source
  for field in "${fields[@]}"; do
    route_known_field "$field" || return 1
  done
  address="/projects/$slug/"
  output=$(route_output "$address")
  source="${DIST%/}/post/$slug.html"
  route_row "$address" "$output" true project "" "" "$source" "${fields[@]}"
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
    project_route "$slug" "${fields[@]}"
  done < <(project_records slug publishable)
}

# A project as a row for a page that links to it: the catalogue and the
# featured grid. The route table owns the address, so `href` is resolved here;
# an article has no route, so its href is its publication. Callers name the
# project fields they print, exactly as project_records.
project_row_records() {
  local -a fields=("$@")
  local -a record_fields=()
  local -a record
  local field href value first
  local i

  for field in "${fields[@]}"; do
    case $field in
      href | publishable | publication) ;;
      *)
        project_known_field "$field" || return 1
        record_fields+=("$field")
        ;;
    esac
  done

  while IFS=$'\037' read -r -a record; do
    local slug=${record[0]:-} publishable=${record[1]:-} publication=${record[2]:-}
    if [[ $publishable == true ]]; then
      href=$(project_route "$slug" address) || return 1
    else
      href=$publication
    fi
    first=1
    i=0
    for field in "${fields[@]}"; do
      case $field in
        href) value=$href ;;
        publishable) value=$publishable ;;
        publication) value=$publication ;;
        *)
          # read drops a trailing empty field, so a row's last column can be
          # absent under `set -u`.
          value=${record[3 + i]:-}
          i=$((i + 1))
          ;;
      esac
      if ((first)); then
        first=0
      else
        printf '\037'
      fi
      printf '%s' "$value"
    done
    printf '\n'
  done < <(project_records slug publishable publication "${record_fields[@]}")
}
