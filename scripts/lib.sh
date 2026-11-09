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
