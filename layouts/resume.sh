#!/usr/bin/env bash
# Resume: the complete record, in chronological order, from the project
# sidecars and the hand-written resume records under content/resume/.
set -euo pipefail

: "${META_DIR:?META_DIR is required}"
: "${SITE_ROOT:?SITE_ROOT is required}"

# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/lib.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/layouts/shell.sh"

resume_dir=${RESUME_DIR:-"$SITE_ROOT/content/resume"}
name=${FULL_NAME:?content/identity.sh must define FULL_NAME}
tagline=${TAGLINE:?content/identity.sh must define TAGLINE}
omit_entries=${RESUME_OMIT_ENTRIES:-}
selector=${RESUME_SELECTOR:-1}

# The canonical selection is the PDF's. The page renders every entry but marks
# the PDF's omissions hidden, so the no-query default is the same selection
# without duplicating the list in a second place.
default_omitted=${RESUME_DEFAULT_OMIT_ENTRIES-}
if [[ -z ${RESUME_DEFAULT_OMIT_ENTRIES+x} && -f $resume_dir/print.sh ]]; then
  # shellcheck source=/dev/null
  source "$resume_dir/print.sh"
  default_omitted="${PRINT_OMIT_ENTRIES[*]:-}"
fi

is_default_omitted() {
  local id
  for id in $default_omitted; do
    [[ $id == "$1" ]] && return 0
  done
  return 1
}

hidden_attr() {
  if is_default_omitted "$1"; then
    printf ' hidden'
  fi
}

checked_attr() {
  if ! is_default_omitted "$1"; then
    printf ' checked'
  fi
}

# A toggle sits beside the thing it governs: the section heading, or the
# experience entry. Its value is the id of the element it shows or hides.
toggle_html() {
  printf '<label class="resume-toggle"><input type="checkbox" name="include" value="%s"%s aria-label="Show or hide %s"></label>' \
    "$(html_escape "$1")" "$(checked_attr "$1")" "$(html_escape "$2")"
}

# The heading row of a section: the selector toggle on the left when the
# selector is on, and the heading itself always.
section_heading() {
  local id=$1 label=$2
  printf '            <div class="resume-section-head">\n'
  if [[ $selector == 1 ]]; then
    printf '              %s\n' "$(toggle_html "$id" "$label")"
  fi
  printf '              <h2 id="%s">%s</h2>\n' "$id" "$(html_escape "$label")"
  printf '            </div>\n'
}

# The page carries everything. The PDF selection passes the entries it leaves
# out here, by the same stable id the page gives each one.
entry_wanted() {
  local omitted
  for omitted in $omit_entries; do
    [[ $omitted == "$1" ]] && return 1
  done
  return 0
}

# Render a section whose entries nest under one employer or organisation,
# newest first. Grouping is by identity rather than adjacency, so two roles at
# the same employer stay together even when another role is dated between them.
render_grouped_entries() {
  local dir=$1 group_field=$2 id_prefix=$3
  local -a groups=()
  local -a group_files=()
  local file group first location title start end slug
  local i found

  while IFS= read -r file; do
    [[ -n $file ]] || continue
    slug=$(basename "$file" .md)
    entry_wanted "$id_prefix-$slug" || continue
    group=$(frontmatter_value "$file" "$group_field")
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
  done < <(resume_files "$dir" start)

  for ((i = 0; i < ${#groups[@]}; i++)); do
    group=${groups[i]}
    first=${group_files[i]%%$'\n'*}
    location=$(frontmatter_value "$first" location)

    printf '            <div class="resume-group">\n'
    printf '              <h3>%s</h3>\n' "$(html_escape "$group")"
    if [[ -n $location ]]; then
      printf '              <p class="meta">%s</p>\n' "$(html_escape "$location")"
    fi

    while IFS= read -r file; do
      [[ -n $file ]] || continue
      title=$(frontmatter_value "$file" title)
      start=$(frontmatter_value "$file" start)
      end=$(frontmatter_value "$file" end)
      slug=$(basename "$file" .md)

      entry_toggle=
      if [[ $selector == 1 && $id_prefix == experience ]]; then
        entry_toggle=$(toggle_html "$id_prefix-$slug" "$title, $(date_range "$start" "$end")")
      fi

      cat <<EOF
              <div class="resume-entry" id="$id_prefix-$slug"$(hidden_attr "$id_prefix-$slug")>
                <div class="resume-entry-head">
                  $entry_toggle
                  <p class="resume-entry-title">$(html_escape "$title")</p>
                </div>
                <p class="resume-entry-dates">$(date_range "$start" "$end")</p>
                <div class="prose resume-body">
$(markdown_body "$file")
                </div>
              </div>
EOF
    done <<< "${group_files[i]}"

    printf '            </div>\n'
  done
}

page_open_plain "Resume, Jenny Leidig"
cat <<EOF
        <article class="resume">
          <header class="resume-header">
            <h1>Resume</h1>
            <p class="resume-name">$(html_escape "$name")</p>
            <p class="resume-tagline">$(html_escape "$tagline")</p>
EOF

if [[ -n ${RESUME_PHONE:-} ]]; then
  printf '            <p class="resume-phone">%s</p>\n' "$(html_escape "$RESUME_PHONE")"
fi

cat <<EOF
            <ul class="links primary-links" aria-label="Contact">
EOF

for entry in "${PRIMARY_LINKS[@]}"; do
  label=${entry%%=*}
  url=${entry#*=}
  printf '              <li><a href="%s">%s</a></li>\n' "$(html_escape "$url")" "$(html_escape "$label")"
done

cat <<EOF
            </ul>
          </header>
EOF

if [[ $selector == 1 ]]; then
  cat <<EOF
          <p class="resume-selector-note" data-resume-selector data-default-omitted="$(html_escape "$default_omitted")">A checkbox beside a section or an experience entry chooses what appears. The default matches the PDF, and the address bar carries the selection.</p>
EOF
fi

cat <<EOF

          <section class="resume-section" aria-labelledby="resume-summary" data-resume-section="resume-summary"$(hidden_attr resume-summary)>
$(section_heading resume-summary Summary)
            <div class="prose">
$(markdown_body "$resume_dir/summary.md")
            </div>
          </section>

          <section class="resume-section" aria-labelledby="resume-experience" data-resume-section="resume-experience"$(hidden_attr resume-experience)>
$(section_heading resume-experience Experience)
EOF

render_grouped_entries "$resume_dir/experience" employer experience

cat <<EOF
          </section>

          <section class="resume-section" aria-labelledby="resume-projects" data-resume-section="resume-projects"$(hidden_attr resume-projects)>
$(section_heading resume-projects Projects)
EOF

while IFS=$'\t' read -r year title blurb href category project_slug; do
  [[ -n $title ]] || continue
  entry_wanted "project-$project_slug" || continue
  body=$(printf '%s\n' "$blurb" | cmark-gfm --extension table --extension autolink)
  cat <<EOF
            <div class="resume-entry" id="project-$project_slug"$(hidden_attr "project-$project_slug")>
              <p class="resume-entry-title"><a href="$(html_escape "$href")">$(html_escape "$title")</a></p>
              <p class="resume-entry-dates">$(html_escape "$category") &middot; $(html_escape "$year")</p>
              <div class="prose resume-body">$body</div>
            </div>
EOF
done < <(cv_project_records)

cat <<EOF
          </section>

          <section class="resume-section" aria-labelledby="resume-publications" data-resume-section="resume-publications"$(hidden_attr resume-publications)>
$(section_heading resume-publications Publications)
EOF

while IFS= read -r file; do
  [[ -n $file ]] || continue
  title=$(frontmatter_value "$file" title)
  venue=$(frontmatter_value "$file" venue)
  detail=$(frontmatter_value "$file" detail)
  year=$(frontmatter_value "$file" year)
  url=$(frontmatter_value "$file" url)
  slug=$(basename "$file" .md)
  entry_wanted "publication-$slug" || continue

  if [[ -n $url ]]; then
    title_html="<a href=\"$(html_escape "$url")\">$(html_escape "$title")</a>"
  else
    title_html=$(html_escape "$title")
  fi

  meta=$venue
  if [[ -n $detail ]]; then
    meta="$meta, $detail"
  fi
  if [[ -n $year ]]; then
    meta="$meta ($year)"
  fi

  cat <<EOF
            <div class="resume-entry" id="publication-$slug"$(hidden_attr "publication-$slug")>
              <p class="resume-entry-title">$title_html</p>
              <p class="resume-entry-dates">$(html_escape "$meta")</p>
            </div>
EOF
done < <(resume_files "$resume_dir/publications" year)

cat <<EOF
          </section>

          <section class="resume-section" aria-labelledby="resume-volunteering" data-resume-section="resume-volunteering"$(hidden_attr resume-volunteering)>
$(section_heading resume-volunteering Volunteering)
EOF

render_grouped_entries "$resume_dir/volunteering" organization volunteering

cat <<EOF
          </section>

          <section class="resume-section" aria-labelledby="resume-education" data-resume-section="resume-education"$(hidden_attr resume-education)>
$(section_heading resume-education Education)
EOF

while IFS= read -r file; do
  [[ -n $file ]] || continue
  institution=$(frontmatter_value "$file" institution)
  location=$(frontmatter_value "$file" location)
  degree=$(frontmatter_value "$file" degree)
  start=$(frontmatter_value "$file" start)
  end=$(frontmatter_value "$file" end)
  note=$(frontmatter_value "$file" note)
  slug=$(basename "$file" .md)
  entry_wanted "education-$slug" || continue

  cat <<EOF
            <div class="resume-entry" id="education-$slug"$(hidden_attr "education-$slug")>
              <h3>$(html_escape "$institution")</h3>
              <p class="meta">$(html_escape "$location")</p>
              <p class="resume-entry-title">$(html_escape "$degree")</p>
              <p class="resume-entry-dates">$(date_range "$start" "$end")</p>
EOF
  if [[ -n $note ]]; then
    printf '              <p class="resume-note">%s</p>\n' "$(html_escape "$note")"
  fi
  printf '            </div>\n'
done < <(resume_files "$resume_dir/education" start)

cat <<EOF
          </section>

          <section class="resume-section" aria-labelledby="resume-skills" data-resume-section="resume-skills"$(hidden_attr resume-skills)>
$(section_heading resume-skills Skills)
            <div class="prose">
$(markdown_body "$resume_dir/skills.md")
            </div>
          </section>
        </article>
EOF

if [[ $selector == 1 ]]; then
  export PLAIN_SCRIPT=/assets/resume-selector.js
fi

page_close_plain
