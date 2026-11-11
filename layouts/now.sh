#!/usr/bin/env bash
# Now: the hand-written record as a two-column table, Doing and Blurb, with the
# date it was last changed. Each `## Section` in content/now.md is one row.
set -euo pipefail

# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/lib.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/layouts/shell.sh"

now=${NOW_FILE:-"$SITE_ROOT/content/now.md"}
updated=$(frontmatter_value "$now" updated)

# Split the body on its `## ` headings. Each record is the heading on its own
# line, then the section's markdown, separated by \x1e so a section body can
# span any number of paragraphs.
rows=$(
  frontmatter_body "$now" | awk '
    /^## / { printf "\036%s\n", substr($0, 4); next }
    { print }
    END { printf "\036" }
  ' | while IFS= read -r -d $'\036' section; do
    # The first record is the blank line after the frontmatter, and the last is
    # the END marker. Only text before a heading is skipped, not trailing
    # whitespace, or the empty record would render as a blank row.
    [[ $section == *[![:space:]]* ]] || continue
    doing=${section%%$'\n'*}
    body=${section#*$'\n'}
    printf '            <tr>\n'
    printf '              <td class="now-doing">%s</td>\n' "$(html_escape "$doing")"
    printf '              <td class="catalogue-blurb">\n'
    printf '%s\n' "$body" | render_markdown
    printf '              </td>\n'
    printf '            </tr>\n'
  done
)

route=${PAGE_ROUTE:?PAGE_ROUTE is required}
page_open "Now" now "What $SITE_NAME is doing now. Last updated $updated." "$route" "${PAGE_INDEXABLE:?PAGE_INDEXABLE is required}"
cat <<EOF
        <h1>Now</h1>
        <p class="meta">Last updated $(html_escape "$updated")</p>
        <table class="catalogue now-table">
          <thead>
            <tr>
              <th scope="col">Doing</th>
              <th scope="col">Blurb</th>
            </tr>
          </thead>
          <tbody>
$rows
          </tbody>
        </table>
EOF
page_close
