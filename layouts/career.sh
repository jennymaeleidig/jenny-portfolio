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

# One disclosure per role. The summary is the index line the reader scans:
# title, then employer. The employer and its location come from the group
# record, so the three CapTech roles each carry the employer name.
render_experience() {
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
        printf '          <details class="career-disclosure">\n'
        printf '            <summary>%s - %s</summary>\n' \
          "$(html_escape "$title")" "$(html_escape "$employer")"
        printf '            <p class="career-meta">'
        if [[ -n $employer_location ]]; then
          printf '<span class="meta">%s</span> ' "$(html_escape "$employer_location")"
          printf '<span class="career-sep" aria-hidden="true">&middot;</span> '
        fi
        printf '<span class="career-dates">%s</span></p>\n' "$(date_range "$start" "$end")"
        printf '            <div class="prose career-body">\n'
        markdown_body "$file"
        printf '            </div>\n'
        printf '          </details>\n'
        ;;
    esac
  done < <(career_group_records "$career_dir/experience" employer)
}

# One disclosure per volunteering role, grouped and summarised the way the
# experience roles are: title, then organisation.
render_volunteering() {
  local kind group location file title start end
  local organization organization_location
  while IFS=$'\t' read -r kind group location; do
    case $kind in
      group)
        organization=$group
        organization_location=$location
        ;;
      file)
        file=$group
        title=$(frontmatter_value "$file" title)
        start=$(frontmatter_value "$file" start)
        end=$(frontmatter_value "$file" end)
        printf '          <details class="career-disclosure">\n'
        printf '            <summary>%s - %s</summary>\n' \
          "$(html_escape "$title")" "$(html_escape "$organization")"
        printf '            <p class="career-meta">'
        if [[ -n $organization_location ]]; then
          printf '<span class="meta">%s</span> ' "$(html_escape "$organization_location")"
          printf '<span class="career-sep" aria-hidden="true">&middot;</span> '
        fi
        printf '<span class="career-dates">%s</span></p>\n' "$(date_range "$start" "$end")"
        printf '            <div class="prose career-body">\n'
        markdown_body "$file"
        printf '            </div>\n'
        printf '          </details>\n'
        ;;
    esac
  done < <(career_group_records "$career_dir/volunteering" organization)
}

# One disclosure per qualification, summarised as degree - school.
render_education() {
  local institution location degree start end note
  while IFS=$'\t' read -r institution location degree start end note; do
    printf '          <details class="career-disclosure">\n'
    printf '            <summary>%s - %s</summary>\n' \
      "$(html_escape "$degree")" "$(html_escape "$institution")"
    printf '            <p class="career-meta">'
    if [[ -n $location ]]; then
      printf '<span class="meta">%s</span> ' "$(html_escape "$location")"
      printf '<span class="career-sep" aria-hidden="true">&middot;</span> '
    fi
    printf '<span class="career-dates">%s</span>' "$(date_range "$start" "$end")"
    if [[ -n $note ]]; then
      printf ' <span class="career-sep" aria-hidden="true">&middot;</span> '
      printf '<span class="career-note">%s</span>' "$(html_escape "$note")"
    fi
    printf '</p>\n'
    printf '          </details>\n'
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
  "render_$name"
  cat <<EOF
        </section>
EOF
}

if [[ -n $section ]]; then
  heading=$(career_section_label "$section")
else
  heading="Career"
fi

page_open "$heading, Jenny Leidig" work
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
