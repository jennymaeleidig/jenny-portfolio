#!/usr/bin/env bash
# The resume as plain markdown: the same complete record as /resume, from the
# same project sidecars and content/career/ files.
set -euo pipefail

# shellcheck source=/dev/null
: "${META_DIR:?META_DIR is required}"
: "${SITE_ROOT:?SITE_ROOT is required}"

# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/lib.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/content/identity.sh"

career_dir=${CAREER_DIR:-"$SITE_ROOT/content/career"}
name=${FULL_NAME:?content/identity.sh must define FULL_NAME}
tagline=${TAGLINE:?content/identity.sh must define TAGLINE}

render_grouped_entries() {
  local dir=$1 group_field=$2
  local -a groups=()
  local -a group_files=()
  local file group first location title start end
  local i found

  while IFS= read -r file; do
    [[ -n $file ]] || continue
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
  done < <(career_files "$dir" start)

  for ((i = 0; i < ${#groups[@]}; i++)); do
    group=${groups[i]}
    first=${group_files[i]%%$'\n'*}
    location=$(frontmatter_value "$first" location)

    printf '### %s\n\n' "$group"
    if [[ -n $location ]]; then
      printf '%s\n\n' "$location"
    fi

    while IFS= read -r file; do
      [[ -n $file ]] || continue
      title=$(frontmatter_value "$file" title)
      start=$(frontmatter_value "$file" start)
      end=$(frontmatter_value "$file" end)

      printf '#### %s\n\n' "$title"
      printf '%s\n\n' "$(date_range "$start" "$end")"
      markdown_source "$file"
      printf '\n'
    done <<< "${group_files[i]}"
  done
}

cat <<EOF
# $name

$tagline

EOF

for entry in "${PRIMARY_LINKS[@]}"; do
  label=${entry%%=*}
  url=${entry#*=}
  printf '%s: [%s](%s)\n' "$label" "${url#mailto:}" "$url"
done

cat <<EOF

## Summary

$(markdown_source "$career_dir/summary.md")

## Experience

EOF

render_grouped_entries "$career_dir/experience" employer

cat <<EOF
## Projects

EOF

while IFS=$'\t' read -r year title blurb href category _slug; do
  [[ -n $title ]] || continue
  printf '### [%s](%s)\n\n' "$title" "$href"
  printf '%s · %s\n\n' "$category" "$year"
  printf '%s\n\n' "$blurb"
done < <(cv_project_records)

cat <<EOF
## Publications

EOF

while IFS= read -r file; do
  [[ -n $file ]] || continue
  title=$(frontmatter_value "$file" title)
  venue=$(frontmatter_value "$file" venue)
  detail=$(frontmatter_value "$file" detail)
  year=$(frontmatter_value "$file" year)
  url=$(frontmatter_value "$file" url)

  meta=$venue
  if [[ -n $detail ]]; then
    meta="$meta, $detail"
  fi
  if [[ -n $year ]]; then
    meta="$meta ($year)"
  fi

  if [[ -n $url ]]; then
    printf '### [%s](%s)\n\n' "$title" "$url"
  else
    printf '### %s\n\n' "$title"
  fi
  printf '%s\n\n' "$meta"
done < <(career_files "$career_dir/publications" year)

cat <<EOF
## Volunteering

EOF

render_grouped_entries "$career_dir/volunteering" organization

cat <<EOF
## Education

EOF

while IFS= read -r file; do
  [[ -n $file ]] || continue
  institution=$(frontmatter_value "$file" institution)
  location=$(frontmatter_value "$file" location)
  degree=$(frontmatter_value "$file" degree)
  start=$(frontmatter_value "$file" start)
  end=$(frontmatter_value "$file" end)
  note=$(frontmatter_value "$file" note)

  printf '### %s\n\n' "$institution"
  if [[ -n $location ]]; then
    printf '%s\n\n' "$location"
  fi
  printf '**%s**\n\n' "$degree"
  printf '%s\n\n' "$(date_range "$start" "$end")"
  if [[ -n $note ]]; then
    printf '%s\n\n' "$note"
  fi
done < <(career_files "$career_dir/education" start)

cat <<EOF
## Skills

$(markdown_source "$career_dir/skills.md")
EOF
