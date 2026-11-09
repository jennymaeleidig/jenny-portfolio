#!/usr/bin/env bash
# The front page: the featured projects as cards on the character grid.
set -euo pipefail

: "${SITE_ROOT:?SITE_ROOT is required}"

# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/lib.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/layouts/shell.sh"

# Collect the featured records first, so a project that is not featured never
# reaches the grid.
cards=()
while IFS=$'\t' read -r _group _order year _slug category title blurb href featured; do
  [[ $featured == "true" ]] || continue
  cards+=("$year"$'\t'"$category"$'\t'"$title"$'\t'"$blurb"$'\t'"$href")
done < <(project_records)

page_open "$SITE_NAME" home
cat <<EOF
        <h1>$SITE_NAME</h1>
        <p class="lede">$(html_escape "$TAGLINE")</p>
        <ul class="grid featured">
EOF

for card in ${cards[@]+"${cards[@]}"}; do
  IFS=$'\t' read -r year category title blurb href <<< "$card"
  printf '          <li class="card">\n'
  printf '            <a href="%s">%s</a>\n' "$(html_escape "$href")" "$(html_escape "$title")"
  printf '            <p class="meta">%s &middot; %s</p>\n' \
    "$(html_escape "$category")" "$(html_escape "$year")"
  if [[ -n $blurb ]]; then
    printf '            <div class="card-blurb">%s</div>\n' "$blurb"
  fi
  printf '          </li>\n'
done

cat <<EOF
        </ul>
EOF
page_close
