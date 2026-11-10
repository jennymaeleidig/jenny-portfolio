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
if [[ -n $category ]] && ! vocabulary_has categories "$category"; then
  echo "error: unknown category '$category'" >&2
  exit 1
fi

if [[ -n $category ]]; then
  heading=$(vocabulary_label categories "$category")
  title="$heading, $SITE_NAME"
else
  # The route is /work/, but the tab the reader is on is Projects.
  heading="Projects"
  title="Projects, $SITE_NAME"
fi

rows=$(
  while IFS= read -r slug; do
    (
      # shellcheck source=/dev/null
      source "$META_DIR/$slug.sh"
      if [[ -n $category && $META_CATEGORY != "$category" ]]; then
        exit 0
      fi
      printf '            <tr>\n'
      printf '              <td class="catalogue-title"><a href="%s">%s</a></td>\n' \
        "$(html_escape "$META_HREF")" "$(html_escape "$META_TITLE")"
      printf '              <td class="catalogue-blurb">%s</td>\n' "${META_BLURB:-}"
      if [[ -z $category ]]; then
        printf '              <td class="catalogue-category">%s</td>\n' \
          "$(html_escape "$(vocabulary_label categories "$META_CATEGORY")")"
      fi
      printf '              <td class="meta">%s</td>\n' "$(html_escape "$META_YEAR")"
      printf '            </tr>\n'
    )
  done < <(project_records)
)

page_open "$title" work
cat <<EOF
        <h1>$heading</h1>
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
