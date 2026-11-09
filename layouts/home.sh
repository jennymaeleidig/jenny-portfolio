#!/usr/bin/env bash
# The front page, rendered from the project metadata sidecars.
set -euo pipefail

# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/lib.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/layouts/shell.sh"

shopt -s nullglob

items=$(
  for meta in "$META_DIR"/*.sh; do
    (
      # shellcheck source=/dev/null
      source "$meta"
      printf '%s\t%s\n' "$META_YEAR" "$META_SLUG"
    )
  done | sort -r | while IFS=$'\t' read -r year slug; do
    # shellcheck source=/dev/null
    source "$META_DIR/$slug.sh"
    if [[ ${META_FEATURED:-} != "true" ]]; then
      continue
    fi
    printf '        <li class="work-item"><a href="/projects/%s/">%s</a> <span class="meta">%s &middot; %s</span></li>\n' \
      "$slug" "$(html_escape "$META_TITLE")" "$(html_escape "$META_CATEGORY")" "$year"
  done
)

page_open "Jenny Leidig"
cat <<EOF
        <h1>Jenny Leidig</h1>
        <p class="lede">Games, sound, hardware, and web.</p>
        <ul class="work-list">
$items
        </ul>
EOF
page_close
