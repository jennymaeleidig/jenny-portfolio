#!/usr/bin/env bash
# The front page: the featured projects as cards on the character grid.
set -euo pipefail

: "${SITE_ROOT:?SITE_ROOT is required}"

# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/lib.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/layouts/shell.sh"

# Collect the featured records first: the grid runs at most three to a row, so
# the last row is known here and only its cards carry the closing rule.
cards=()
while IFS=$'\t' read -r _group _order year _slug category title blurb href featured; do
  [[ $featured == "true" ]] || continue
  cards+=("$year"$'\t'"$category"$'\t'"$title"$'\t'"$blurb"$'\t'"$href")
done < <(project_records)

count=${#cards[@]}
if ((count <= 3)); then
  last_row=$count
else
  last_row=$(((count - 1) % 3 + 1))
fi
last_start=$((count - last_row))

page_open "Jenny Leidig" home
cat <<EOF
        <h1>Jenny Leidig</h1>
        <p class="lede">$(html_escape "$TAGLINE")</p>
        <ul class="grid featured">
EOF

index=0
for card in ${cards[@]+"${cards[@]}"}; do
  IFS=$'\t' read -r year category title blurb href <<< "$card"
  class="card"
  if ((index >= last_start)); then
    class="card card-last"
  fi
  printf '          <li class="%s">\n' "$class"
  printf '            <a href="%s">%s</a>\n' "$(html_escape "$href")" "$(html_escape "$title")"
  printf '            <p class="meta">%s &middot; %s</p>\n' \
    "$(html_escape "$category")" "$(html_escape "$year")"
  if [[ -n $blurb ]]; then
    printf '            <div class="card-blurb">%s</div>\n' "$blurb"
  fi
  printf '          </li>\n'
  index=$((index + 1))
done

cat <<EOF
        </ul>
EOF
page_close
