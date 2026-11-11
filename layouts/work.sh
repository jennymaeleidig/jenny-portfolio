#!/usr/bin/env bash
# The catalogue: every project in one table, or one category's rows.
set -euo pipefail

# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/lib.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/routes.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/layouts/shell.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/layouts/tabs.sh"

route=${1:?a route is required}
indexable=${2:?an indexable flag is required}
category=${3:-}
if [[ -n $category ]] && ! vocabulary_has categories "$category"; then
  echo "error: unknown category '$category'" >&2
  exit 1
fi

if [[ -n $category ]]; then
  heading=$(vocabulary_label categories "$category")
  description="Every project in the catalogue filed under $heading."
else
  # The route is /work/, but the tab the reader is on is Projects.
  heading="Projects"
  description="The catalogue: every project, newest first, with its blurb, category and year."
fi

rows=$(
  while IFS=$'\037' read -r href title blurb row_category year; do
    if [[ -n $category && $row_category != "$category" ]]; then
      continue
    fi
    printf '            <tr>\n'
    printf '              <td class="catalogue-title"><a href="%s">%s</a></td>\n' \
      "$(html_escape "$href")" "$(html_escape "$title")"
    printf '              <td class="catalogue-blurb">%s</td>\n' "$blurb"
    if [[ -z $category ]]; then
      printf '              <td class="catalogue-category">%s</td>\n' \
        "$(html_escape "$(vocabulary_label categories "$row_category")")"
    fi
    printf '              <td class="meta">%s</td>\n' "$(html_escape "$year")"
    printf '            </tr>\n'
  done < <(project_row_records href title blurb category year)
)

heading_html=$(html_escape "$heading")
page_open "$heading" work "$description" "$route" "$indexable"
cat <<EOF
        <h1>$heading_html</h1>
$(tab_bar projects)
        <nav aria-label="Categories">
          <ul class="filters">
EOF

printf '            <li><a href="/work/"%s>All</a></li>\n' \
  "$(current_page_attr "" "$category")"
while IFS= read -r name; do
  printf '            <li><a href="/work/%s/"%s>%s</a></li>\n' \
    "$name" \
    "$(current_page_attr "$name" "$category")" \
    "$(vocabulary_label categories "$name")"
done < <(vocabulary_words categories)

cat <<EOF
          </ul>
        </nav>
        <table class="catalogue">
          <thead>
            <tr>
              <th scope="col">Project</th>
              <th scope="col">Blurb</th>
EOF

# Only the whole catalogue needs the category spelled out; on a category page
# every row is that category already.
if [[ -z $category ]]; then
  printf '              <th scope="col">Category</th>\n'
fi

cat <<EOF
              <th scope="col">Year</th>
            </tr>
          </thead>
          <tbody>
$rows
          </tbody>
        </table>
EOF
page_close
