#!/usr/bin/env bash
# The public career tab: the narrow record from content/career. Experience,
# volunteering, education and skills are each a stack of native <details>
# disclosures, so the summaries read as an index and the record opens without
# JavaScript. The whole record is one page; each section also has its own route
# behind the filter bar, the same shape as the project categories.
set -euo pipefail

: "${SITE_ROOT:?SITE_ROOT is required}"

# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/lib.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/layouts/shell.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/layouts/tabs.sh"

career_dir=${CAREER_DIR:-"$SITE_ROOT/content/career"}

section=${1:-}
if [[ -n $section ]] && ! is_career_section "$section"; then
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
    printf '<span class="career-sep" aria-hidden="true">&middot;</span> '
  fi
  printf '<span class="career-dates">%s</span>' "$(html_escape "$dates")"
  if [[ -n $note ]]; then
    printf ' <span class="career-sep" aria-hidden="true">&middot;</span> '
    printf '<span class="career-note">%s</span>' "$(html_escape "$note")"
  fi
  printf '</p>\n'
  if [[ -n $file ]]; then
    printf '            <div class="prose career-body">\n'
    markdown_body "$file"
    printf '            </div>\n'
  fi
  printf '          </details>\n'
}

# One disclosure per role in a grouped section. The summary is title, then
# the employer or organisation whose group the role belongs to; the identity
# field is the only word experience and volunteering do not share.
render_roles() {
  local dir=$1 field=$2
  local kind group location file title start end employer employer_location
  while IFS=$'\t' read -r kind group location; do
    case $kind in
      group)
        employer=$group
        employer_location=$location
        ;;
      file)
        file=$group
        title=$(frontmatter_value "$file" title)
        start=$(frontmatter_value "$file" start)
        end=$(frontmatter_value "$file" end)
        career_disclosure "$title - $employer" "$employer_location" \
          "$(date_range "$start" "$end")" '' "$file"
        ;;
    esac
  done < <(career_group_records "$dir" "$field")
}

# One disclosure per qualification, summarised as degree - school.
render_education() {
  local institution location degree start end note
  while IFS=$'\t' read -r institution location degree start end note; do
    career_disclosure "$degree - $institution" "$location" \
      "$(date_range "$start" "$end")" "$note" ''
  done < <(career_education_records "$career_dir/education")
}

# One disclosure per skill group, summarised by the group name: `Data and
# cloud`. The skills themselves are a list, which CSS lays out in two columns
# when the sheet is wide enough for them.
render_skills() {
  local file=${1:-"$career_dir/skills.md"} category item current="" open=0
  while IFS=$'\t' read -r category item; do
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
  done < <(career_skill_records "$file")
  if ((open)); then
    printf '            </ul>\n'
    printf '          </details>\n'
  fi
}

# One section's markup. The whole record names each section with a heading; a
# filtered route already carries that name as the page's own title, so it does
# not repeat it above the disclosures.
render_section() {
  local name=$1 label
  label=$(career_section_label "$name")
  if [[ $section == "$name" ]]; then
    cat <<EOF
        <section class="career-section career-section-ruled" aria-label="$label">
EOF
  else
    cat <<EOF
        <section class="career-section" aria-labelledby="career-$name">
          <h2 id="career-$name">$label</h2>
EOF
  fi
  case $name in
    experience) render_roles "$career_dir/experience" employer ;;
    volunteering) render_roles "$career_dir/volunteering" organization ;;
    education) render_education ;;
    skills) render_skills ;;
  esac
  cat <<EOF
        </section>
EOF
}

if [[ -n $section ]]; then
  heading=$(career_section_label "$section")
else
  heading="Career"
fi

page_open "$heading, $SITE_NAME" work
cat <<EOF
        <h1>$heading</h1>
$(tab_bar career)

        <nav aria-label="Career sections">
          <ul class="filters">
EOF

printf '            <li><a href="/work/career/"%s>All</a></li>\n' \
  "$(current_page_attr "" "$section")"
while IFS= read -r name; do
  printf '            <li><a href="/work/career/%s/"%s>%s</a></li>\n' \
    "$name" \
    "$(current_page_attr "$name" "$section")" \
    "$(career_section_label "$name")"
done < <(vocabulary_words "${CAREER_SECTIONS[@]}")

cat <<EOF
          </ul>
        </nav>
EOF

while IFS= read -r name; do
  if [[ -n $section && $section != "$name" ]]; then
    continue
  fi
  render_section "$name"
done < <(vocabulary_words "${CAREER_SECTIONS[@]}")

page_close
