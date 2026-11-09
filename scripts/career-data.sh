#!/usr/bin/env bash
# Generate the one-way career-data mirror from the site's record.
#
# The site's content/ is the source of truth. This writes the identity block
# and cv.md in the shape career-ops reads; the mirror is never edited by hand.
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
root=$(cd -- "$script_dir/.." && pwd)

# shellcheck source=/dev/null
source "$script_dir/lib.sh"

mirror_arg=${1:-${MIRROR_DIR:-"$root/build/career-data"}}
if [[ $mirror_arg = /* ]]; then
  mirror=$mirror_arg
else
  mirror="$PWD/$mirror_arg"
fi

content_dir=${CONTENT_DIR:-"$root/content/projects"}
career_dir=${CAREER_DIR:-"$root/content/career"}
identity_file=${IDENTITY_FILE:-"$root/content/identity.sh"}
contact_file=${CONTACT_FILE:-"$career_dir/contact.sh"}

# shellcheck source=/dev/null
source "$identity_file"
portfolio=${PORTFOLIO:-https://portfolio.jenny-page.online}
location=${LOCATION:-}

phone=
if [[ -f $contact_file ]]; then
  # shellcheck source=/dev/null
  source "$contact_file"
  phone=${PHONE:-}
fi

if ! command -v cmark-gfm >/dev/null 2>&1; then
  echo "error: cmark-gfm is required, install it with 'brew install cmark-gfm' or 'apt install cmark-gfm'" >&2
  exit 1
fi

staging=$(mktemp -d "${TMPDIR:-/tmp}/career-data.XXXXXX")
cleanup() {
  if [[ -n ${staging:-} && -d $staging ]]; then
    find "$staging" -depth -delete
  fi
}
trap cleanup EXIT

meta_dir="$staging/.meta"
mkdir -p "$meta_dir"

# Stage through the same validation the site build uses. A missing field or a
# cv:true project without a blurb fails here, before anything is written.
"$script_dir/stage.sh" "$content_dir" "$staging" "$meta_dir" "$root"
export META_DIR=$meta_dir

mkdir -p "$mirror/config"

date_span() {
  printf '%s - %s' "$(date_label "$1")" "$(date_label "$2")"
}

# Render a section whose entries nest under one employer or organisation,
# newest first. Grouping is by identity, exactly as /resume groups it, so two
# roles at the same employer stay together.
render_grouped() {
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

    if [[ -n $location ]]; then
      printf '### %s -- %s\n\n' "$group" "$location"
    else
      printf '### %s\n\n' "$group"
    fi

    while IFS= read -r file; do
      [[ -n $file ]] || continue
      title=$(frontmatter_value "$file" title)
      start=$(frontmatter_value "$file" start)
      end=$(frontmatter_value "$file" end)

      printf '**%s**\n%s\n\n%s\n\n' "$title" "$(date_span "$start" "$end")" "$(markdown_source "$file")"
    done <<< "${group_files[i]}"
  done
}

render_cv() {
  cat <<EOF
# CV -- $FULL_NAME

$TAGLINE

**Location:** $location
**Email:** $EMAIL
EOF

  if [[ -n $phone ]]; then
    printf '**Phone:** %s\n' "$phone"
  fi

  cat <<EOF
**Portfolio:** $portfolio
**itch.io:** $ITCH
**LinkedIn:** $LINKEDIN
**GitHub:** $GITHUB

## Professional Summary

$(markdown_source "$career_dir/summary.md")

## Work Experience

EOF

  render_grouped "$career_dir/experience" employer

  cat <<EOF
## Projects

EOF

  while IFS=$'\t' read -r year title blurb _href _category _slug; do
    [[ -n $title ]] || continue
    printf '### %s -- %s\n\n%s\n\n' "$title" "$year" "$blurb"
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

    printf -- '- **%s** -- *%s*' "$title" "$venue"
    if [[ -n $detail ]]; then
      printf ', %s' "$detail"
    fi
    if [[ -n $year ]]; then
      printf ' (%s)' "$year"
    fi
    printf '.'
    if [[ -n $url ]]; then
      printf ' %s' "$url"
    fi
    printf '\n\n'
  done < <(career_files "$career_dir/publications" year)

  cat <<EOF
## Volunteering

EOF

  render_grouped "$career_dir/volunteering" organization

  cat <<EOF
## Education

EOF

  while IFS= read -r file; do
    [[ -n $file ]] || continue
    institution=$(frontmatter_value "$file" institution)
    school_location=$(frontmatter_value "$file" location)
    degree=$(frontmatter_value "$file" degree)
    start=$(frontmatter_value "$file" start)
    end=$(frontmatter_value "$file" end)
    note=$(frontmatter_value "$file" note)

    if [[ -n $school_location ]]; then
      printf '### %s -- %s\n\n' "$institution" "$school_location"
    else
      printf '### %s\n\n' "$institution"
    fi
    printf '**%s**\n%s\n\n' "$degree" "$(date_span "$start" "$end")"
    if [[ -n $note ]]; then
      printf '%s\n\n' "$note"
    fi
  done < <(career_files "$career_dir/education" start)

  cat <<EOF
## Skills

$(markdown_source "$career_dir/skills.md")
EOF
}

# career-ops stores the two profile links without a scheme or www prefix.
profile_link() {
  local url=$1
  url=${url#https://}
  url=${url#http://}
  url=${url#www.}
  printf '%s' "${url%/}"
}

render_candidate() {
  cat <<EOF
candidate:
  full_name: "$FULL_NAME"
  title: "$TAGLINE"
  email: "$EMAIL"
  phone: "$phone"
  location: "$location"
  linkedin: "$(profile_link "$LINKEDIN")"
  portfolio_url: "$portfolio"
  github: "$(profile_link "$GITHUB")"
  photo: ""
EOF
}

# Replace only the candidate mapping. Every other key (target_roles,
# narrative, compensation, ...) is career-data's own editorial content and is
# preserved byte-for-byte. A profile that does not exist yet gets the identity
# block alone; a profile without a candidate mapping gets one appended.
merge_profile() {
  local profile=$1 fragment=$2
  local merged="$staging/profile.yml"

  if [[ ! -e $profile ]]; then
    {
      printf '# Career-Ops Profile Configuration\n'
      printf '# The candidate block is generated from jenny-portfolio content/. Do not edit it here.\n\n'
      cat "$fragment"
    } > "$merged"
  elif ! grep -q '^candidate:' "$profile"; then
    cat "$profile" > "$merged"
    printf '\n' >> "$merged"
    cat "$fragment" >> "$merged"
  else
    awk -v frag="$fragment" '
      BEGIN {
        while ((getline line < frag) > 0) block = block line "\n"
        close(frag)
      }
      /^candidate:[[:space:]]*$/ && !done {
        printf "%s", block
        done = 1
        skip = 1
        next
      }
      skip {
        # A blank line ends the mapping but belongs to the file, not the
        # candidate block; keep it. Indented lines and comments are replaced.
        if ($0 ~ /^[[:space:]]*$/) { skip = 0; print; next }
        if ($0 ~ /^[[:space:]]/) next
        skip = 0
      }
      { print }
    ' "$profile" > "$merged"
  fi

  mv "$merged" "$profile"
}

render_cv > "$mirror/cv.md"

candidate="$staging/candidate.yml"
render_candidate > "$candidate"
merge_profile "$mirror/config/profile.yml" "$candidate"
