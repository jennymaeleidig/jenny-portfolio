#!/usr/bin/env bash
# The front page: the featured projects as cards on the character grid.
set -euo pipefail

: "${SITE_ROOT:?SITE_ROOT is required}"

# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/lib.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/layouts/shell.sh"

# Collect the featured cards first, so a project that is not featured never
# reaches the grid. project_records puts the catalogue in canonical order; each
# row's facts come from its sidecar by name.
cards=$(
  while IFS= read -r slug; do
    (
      # shellcheck source=/dev/null
      source "$META_DIR/$slug.sh"
      [[ ${META_FEATURED:-} == "true" ]] || exit 0
      printf '%s\t%s\t%s\t%s\t%s\n' \
        "$META_YEAR" "$META_CATEGORY" "$META_TITLE" "${META_BLURB:-}" "$META_HREF"
    )
  done < <(project_records)
)

PAGE_DESCRIPTION="$FULL_NAME — $TAGLINE."
page_open "$SITE_NAME" home
cat <<EOF
        <h1>$SITE_NAME</h1>
        <p class="lede">$(html_escape "$TAGLINE")</p>
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
