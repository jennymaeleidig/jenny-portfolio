#!/usr/bin/env bash
# The identity record: the site's name, tagline, host, email and primary links.
#
# content/identity.sh is the data; this module is its interface. It sources the
# file once, refuses a missing required fact, and hands links over as
# title<TAB>url records, the shape a project's links use (ADR-0002). Sourced,
# not executed: the validation below returns to the caller.

identity_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
identity_file=${IDENTITY_FILE:-"$identity_root/content/identity.sh"}

# shellcheck source=/dev/null
source "$identity_file"

# The facts a caller may ask for by name.
identity_known() {
  case $1 in
    FULL_NAME | SITE_NAME | TAGLINE | LOCATION | PORTFOLIO | EMAIL) return 0 ;;
    *)
      echo "error: unknown identity key '$1'" >&2
      return 1
      ;;
  esac
}

identity_value() {
  identity_known "$1" || return 1
  printf '%s' "${!1:-}"
}

# The primary links as title<TAB>url records, in file order.
identity_links() {
  local entry title url
  if ! declare -p PRIMARY_LINKS >/dev/null 2>&1; then
    echo "error: $identity_file: missing 'PRIMARY_LINKS'" >&2
    return 1
  fi
  for entry in "${PRIMARY_LINKS[@]}"; do
    IFS=$'\t' read -r title url <<< "$entry"
    if [[ -z $title || -z $url ]]; then
      echo "error: $identity_file: a primary link must be title<TAB>url" >&2
      return 1
    fi
    if [[ ! $url =~ ^(https?://|mailto:)[^[:space:]]+$ ]]; then
      echo "error: $identity_file: link '$title' must be an http(s) or mailto URL" >&2
      return 1
    fi
    printf '%s\t%s\n' "$title" "$url"
  done
}

identity_check() {
  local key value
  for key in FULL_NAME SITE_NAME TAGLINE PORTFOLIO EMAIL; do
    value=$(identity_value "$key") || return 1
    if [[ -z $value ]]; then
      echo "error: $identity_file: missing required key '$key'" >&2
      return 1
    fi
  done
  identity_links >/dev/null
}

identity_check || return 1
