#!/usr/bin/env bash
# The catalogue: every project in one table, or one category's rows.
set -euo pipefail

# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/lib.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/layouts/shell.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/layouts/tabs.sh"

category=${1:-}
if [[ -n $category ]] && ! is_category "$category"; then
  echo "error: unknown category '$category'" >&2
  exit 1
fi

if [[ -n $category ]]; then
  heading=$(category_label "$category")
  title="$heading, Jenny Leidig"
  lede="Every project in the $category category."
else
  heading="Work"
  title="Work, Jenny Leidig"
  lede="Every project in the catalogue."
fi

rows=$(
  project_records | while IFS=$'\t' read -r _group _order year _slug item_category item_title blurb href _featured; do
    if [[ -n $category && $item_category != "$category" ]]; then
      continue
    fi
    printf '            <tr>\n'
    printf '              <td class="meta">%s<br>%s</td>\n' \
      "$(html_escape "$item_category")" "$(html_escape "$year")"
    printf '              <td class="catalogue-title"><a href="%s">%s</a></td>\n' \
      "$(html_escape "$href")" "$(html_escape "$item_title")"
    printf '              <td class="catalogue-blurb">%s</td>\n' "$blurb"
    printf '            </tr>\n'
  done
)

page_open "$title"
cat <<EOF
        <h1>$heading</h1>
$(tab_bar projects)
        <p class="lede">$lede</p>
        <nav aria-label="Categories">
          <ul class="filters">
EOF

printf '            <li><a href="/work/"%s>All</a></li>\n' \
  "$(current_page_attr "" "$category")"
for name in "${CATEGORIES[@]}"; do
  printf '            <li><a href="/work/%s/"%s>%s</a></li>\n' \
    "$name" \
    "$(current_page_attr "$name" "$category")" \
    "$(category_label "$name")"
done

cat <<EOF
          </ul>
        </nav>
        <table class="catalogue">
          <thead>
            <tr>
              <th scope="col">Category and year</th>
              <th scope="col">Project</th>
              <th scope="col">Blurb</th>
            </tr>
          </thead>
          <tbody>
$rows
          </tbody>
        </table>
EOF
page_close
