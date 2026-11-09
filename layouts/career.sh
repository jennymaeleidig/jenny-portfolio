#!/usr/bin/env bash
# The public career tab: the narrow record from content/career. Experience is
# grouped under each employer, newest role first; education and skills follow.
# Summary, CV projects, publications, volunteering and contact details are
# deliberately not part of this page.
set -euo pipefail

: "${SITE_ROOT:?SITE_ROOT is required}"

# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/lib.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/layouts/shell.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/layouts/tabs.sh"

career_dir=${CAREER_DIR:-"$SITE_ROOT/content/career"}

# Render roles nested under one employer. Grouping is by identity rather than
# adjacency, so two stints at the same employer stay together even when another
# role is dated between them.
render_experience() {
  local -a groups=()
  local -a group_files=()
  local file group first location title start end
  local i found

  while IFS= read -r file; do
    [[ -n $file ]] || continue
    group=$(frontmatter_value "$file" employer)
    found=-1
    for ((i = 0; i < ${#groups[@]}; i++)); do
      if [[ ${groups[i]} == "$group" ]]; then
        found=$i
        break
      fi
    done
    if ((found < 0)); then
      groups+=("$group")
      group_files+=("$file")
    else
      group_files[found]+=$'\n'"$file"
    fi
  done < <(career_files "$career_dir/experience" start)

  for ((i = 0; i < ${#groups[@]}; i++)); do
    group=${groups[i]}
    first=${group_files[i]%%$'\n'*}
    location=$(frontmatter_value "$first" location)

    printf '          <div class="career-group">\n'
    printf '            <h3>%s</h3>\n' "$(html_escape "$group")"
    if [[ -n $location ]]; then
      printf '            <p class="meta">%s</p>\n' "$(html_escape "$location")"
    fi

    while IFS= read -r file; do
      [[ -n $file ]] || continue
      title=$(frontmatter_value "$file" title)
      start=$(frontmatter_value "$file" start)
      end=$(frontmatter_value "$file" end)
      cat <<EOF
            <div class="career-entry">
              <p class="career-entry-title">$(html_escape "$title")</p>
              <p class="career-entry-dates">$(date_range "$start" "$end")</p>
              <div class="prose career-body">
$(markdown_body "$file")
              </div>
            </div>
EOF
    done <<< "${group_files[i]}"

    printf '          </div>\n'
  done
}

page_open "Career, Jenny Leidig"
cat <<EOF
        <h1>Career</h1>
$(tab_bar career)

        <section class="career-section" aria-labelledby="career-experience">
          <h2 id="career-experience">Experience</h2>
EOF

render_experience

cat <<EOF
        </section>

        <section class="career-section" aria-labelledby="career-education">
          <h2 id="career-education">Education</h2>
EOF

while IFS= read -r file; do
  [[ -n $file ]] || continue
  institution=$(frontmatter_value "$file" institution)
  location=$(frontmatter_value "$file" location)
  degree=$(frontmatter_value "$file" degree)
  start=$(frontmatter_value "$file" start)
  end=$(frontmatter_value "$file" end)
  note=$(frontmatter_value "$file" note)

  cat <<EOF
          <div class="career-entry">
            <h3>$(html_escape "$institution")</h3>
            <p class="meta">$(html_escape "$location")</p>
            <p class="career-entry-title">$(html_escape "$degree")</p>
            <p class="career-entry-dates">$(date_range "$start" "$end")</p>
EOF
  if [[ -n $note ]]; then
    printf '            <p class="career-note">%s</p>\n' "$(html_escape "$note")"
  fi
  printf '          </div>\n'
done < <(career_files "$career_dir/education" start)

cat <<EOF
        </section>

        <section class="career-section" aria-labelledby="career-skills">
          <h2 id="career-skills">Skills</h2>
          <div class="prose">
$(markdown_body "$career_dir/skills.md")
          </div>
        </section>
EOF
page_close
