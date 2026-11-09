#!/usr/bin/env bash
# The front page: the featured projects as cards on the character grid.
set -euo pipefail

# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/lib.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/layouts/shell.sh"

cards=$(
  project_records | while IFS=$'\t' read -r _group _order year _slug category title blurb href featured; do
    if [[ $featured != "true" ]]; then
      continue
    fi
    printf '          <li class="card">\n'
    printf '            <a href="%s">%s</a>\n' "$(html_escape "$href")" "$(html_escape "$title")"
    printf '            <p class="meta">%s &middot; %s</p>\n' \
      "$(html_escape "$category")" "$(html_escape "$year")"
    if [[ -n $blurb ]]; then
      printf '            <div class="card-blurb">%s</div>\n' "$blurb"
    fi
    printf '          </li>\n'
  done
)

page_open "Jenny Leidig"
cat <<EOF
        <h1>Jenny Leidig</h1>
        <p class="lede">I make games, sound, hardware, and web things.</p>
        <ul class="grid featured">
$cards
        </ul>
EOF
page_close
