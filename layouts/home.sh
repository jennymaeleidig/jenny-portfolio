#!/usr/bin/env bash
# The front page: the featured projects as cards on the character grid.
set -euo pipefail

: "${SITE_ROOT:?SITE_ROOT is required}"

# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/lib.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/routes.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/layouts/shell.sh"

route=${1:?a route is required}
indexable=${2:?an indexable flag is required}
site_name=$(identity_value SITE_NAME) || exit 1
full_name=$(identity_value FULL_NAME) || exit 1
tagline=$(identity_value TAGLINE) || exit 1

# Collect the featured cards first, so a project that is not featured never
# reaches the grid. project_records puts the catalogue in canonical order and
# answers the named facts; the card filters on the featured flag itself.
cards=$(
  while IFS=$'\037' read -r href title blurb category year featured; do
    [[ $featured == true ]] || continue
    printf '%s\t%s\t%s\t%s\t%s\n' \
      "$year" "$category" "$title" "$blurb" "$href"
  done < <(project_row_records href title blurb category year featured)
)

page_open "$site_name" home "$full_name — $tagline." "$route" "$indexable"
cat <<EOF
        <h1>$(html_escape "$site_name")</h1>
        <p class="lede">$(html_escape "$tagline")</p>
        <ul class="grid featured">
EOF

if [[ -n $cards ]]; then
  while IFS=$'\t' read -r year category title blurb href; do
    printf '          <li class="card">\n'
    printf '            <a href="%s">%s</a>\n' "$(html_escape "$href")" "$(html_escape "$title")"
    printf '            <p class="meta">%s &middot; %s</p>\n' \
      "$(html_escape "$category")" "$(html_escape "$year")"
    if [[ -n $blurb ]]; then
      printf '            <div class="card-blurb">%s</div>\n' "$blurb"
    fi
    printf '          </li>\n'
  done <<< "$cards"
fi

cat <<EOF
        </ul>
EOF
page_close
