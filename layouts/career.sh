#!/usr/bin/env bash
# The public career tab: the narrow record from content/career. Experience,
# volunteering, education and skills are each a stack of native <details>
# disclosures, so the summaries read as an index and the record opens without
# JavaScript. The whole record is one page; each section also has its own route
# behind the filter bar, the same shape as the project categories.
#
# Source (reference for the form, not the words):
#   Andreas Kruszakin, "andreas.vision", https://andreas.vision/
# Work notes paired with the reasoning behind them, specific and first person.
# The site states no licence, so none is assumed: read it, paraphrase nothing
# long, and quote no prose. A living site, so the locator is the URL.
set -euo pipefail

: "${SITE_ROOT:?SITE_ROOT is required}"

# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/lib.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/career.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/layouts/shell.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/layouts/tabs.sh"

career_dir=${CAREER_DIR:-"$SITE_ROOT/content/career"}

route=${1:?a route is required}
indexable=${2:?an indexable flag is required}
section=${3:-}
if [[ -n $section ]] && ! vocabulary_has career-sections "$section"; then
  echo "error: unknown career section '$section'" >&2
  exit 1
fi

# One entry in the career record: the index line the reader scans, then
# location, dates and an optional note, then the entry's prose when it has a
# body. Education has no body, so it passes an empty file.
career_disclosure() {
  local summary=$1 location=$2 dates=$3 note=$4 file=$5
  printf '          <details class="career-disclosure">\n'
  printf '            <summary>%s</summary>\n' "$(html_escape "$summary")"
  printf '            <p class="career-meta">'
  if [[ -n $location ]]; then
    printf '<span class="meta">%s</span> ' "$(html_escape "$location")"
  fi
  printf '<span class="career-dates">%s</span>' "$(html_escape "$dates")"
  if [[ -n $note ]]; then
    printf ' <span class="career-note">%s</span>' "$(html_escape "$note")"
  fi
  printf '</p>\n'
  if [[ -n $file ]]; then
    printf '            <div class="prose career-body">\n'
    markdown_body "$file"
    printf '            </div>\n'
  fi
  printf '          </details>\n'
}

# One disclosure per record. The career module has already chosen the
# summary, grouped the roles, read the fields and formatted the dates; the
# layout only renders them.
render_disclosures() {
  local section=$1 kind summary location dates note body
  while IFS=$'\037' read -r kind summary location dates note body; do
    career_disclosure "$summary" "$location" "$dates" "$note" "$body"
  done < <(career_section_records "$section" "$career_dir")
}

# One disclosure per skill group, summarised by the group name: `Data and
# cloud`. The skills themselves are a list, which CSS lays out in two columns
# when the sheet is wide enough for them.
render_skills() {
  local kind category item current="" open=0
  while IFS=$'\037' read -r kind category item; do
    if [[ $category != "$current" ]]; then
      if ((open)); then
        printf '            </ul>\n'
        printf '          </details>\n'
      fi
      current=$category
      open=1
      printf '          <details class="career-disclosure">\n'
      printf '            <summary>%s</summary>\n' "$(html_escape "$category")"
      printf '            <ul class="skill-list">\n'
    fi
    printf '              <li>%s</li>\n' "$(html_escape "$item")"
  done < <(career_section_records skills "$career_dir")
  if ((open)); then
    printf '            </ul>\n'
    printf '          </details>\n'
  fi
}

# One section's markup. The whole record names each section with a heading, and
# the rule that heading carries; a filtered route already carries that name as
# the page's own title, so it repeats neither the heading nor its rule and opens
# straight on the first disclosure.
render_section() {
  local name=$1 label
  label=$(vocabulary_label career-sections "$name")
  if [[ $section == "$name" ]]; then
    cat <<EOF
        <section class="career-section" aria-label="$label">
EOF
  else
    cat <<EOF
        <section class="career-section" aria-labelledby="career-$name">
          <h2 id="career-$name">$label</h2>
EOF
  fi
  case $name in
    experience | volunteering | education) render_disclosures "$name" ;;
    skills) render_skills ;;
  esac
  cat <<EOF
        </section>
EOF
}

if [[ -n $section ]]; then
  heading=$(vocabulary_label career-sections "$section")
  description="The $heading section of the career record."
else
  heading="Career"
  description="The career record: experience, volunteering, education and skills."
fi

tabs=$(tab_bar career) || exit 1
heading_html=$(html_escape "$heading")
page_open "$heading" work "$description" "$route" "$indexable"
cat <<EOF
        <h1>$heading_html</h1>
$tabs

        <nav aria-label="Career sections">
          <ul class="filters">
EOF

all_href=$(route_address career) || exit 1
printf '            <li><a href="%s"%s>All</a></li>\n' \
  "$all_href" "$(current_page_attr "" "$section")"
while IFS= read -r name; do
  section_href=$(route_address career "$name") || exit 1
  printf '            <li><a href="%s"%s>%s</a></li>\n' \
    "$section_href" \
    "$(current_page_attr "$name" "$section")" \
    "$(vocabulary_label career-sections "$name")"
done < <(vocabulary_words career-sections)

cat <<EOF
          </ul>
        </nav>
EOF

while IFS= read -r name; do
  if [[ -n $section && $section != "$name" ]]; then
    continue
  fi
  render_section "$name"
done < <(vocabulary_words career-sections)

page_close
