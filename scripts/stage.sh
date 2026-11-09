#!/usr/bin/env bash
# Copy each project into a staging directory in the shape jenny expects:
# a dated filename and plain CommonMark with the title as an H1.
set -euo pipefail

content_dir=${1:?content directory required}
staging_dir=${2:?staging directory required}
meta_dir=${3:?metadata directory required}

frontmatter_of() {
  awk '
    NR == 1 && $0 == "---" { capture = 1; next }
    capture && $0 == "---" { exit }
    capture { print }
  ' "$1"
}

body_of() {
  awk '
    NR == 1 && $0 == "---" { in_frontmatter = 1; next }
    in_frontmatter && $0 == "---" { in_frontmatter = 0; next }
    !in_frontmatter { print }
  ' "$1"
}

frontmatter_value() {
  local frontmatter=$1
  local key=$2
  local value

  value=$(printf '%s\n' "$frontmatter" | awk -v key="$key" '
    index($0, key ":") == 1 {
      sub("^" key ":[[:space:]]*", "")
      print
      exit
    }
  ')
  value=${value%$'\r'}
  value=${value#\"}
  value=${value%\"}
  value=${value#\'}
  value=${value%\'}
  printf '%s' "$value"
}

count=0
shopt -s nullglob

for file in "$content_dir"/*.md; do
  name=$(basename "$file")
  slug=${name%.md}

  if [[ ! $slug =~ ^[a-z0-9-]+$ ]]; then
    echo "error: $name: filename must match ^[a-z0-9-]+$" >&2
    exit 1
  fi

  if [[ $(head -n 1 "$file") != "---" ]]; then
    echo "error: $name: missing frontmatter" >&2
    exit 1
  fi

  frontmatter=$(frontmatter_of "$file")
  body=$(body_of "$file")
  year=$(frontmatter_value "$frontmatter" year)

  if [[ ! $year =~ ^[0-9]{4}$ ]]; then
    echo "error: $name: missing or invalid 'year'" >&2
    exit 1
  fi

  title=
  while IFS= read -r line; do
    if [[ $line =~ ^#[[:space:]]+(.*)$ ]]; then
      title=${BASH_REMATCH[1]}
      break
    fi
  done <<< "$body"
  if [[ -z $title ]]; then
    echo "error: $name: missing '# Title' line" >&2
    exit 1
  fi

  mkdir -p "$meta_dir"
  {
    printf 'META_SLUG=%q\n' "$slug"
    printf 'META_TITLE=%q\n' "$title"
    printf 'META_YEAR=%q\n' "$year"
    printf 'META_STATUS=%q\n' "$(frontmatter_value "$frontmatter" status)"
    printf 'META_CATEGORY=%q\n' "$(frontmatter_value "$frontmatter" category)"
    printf 'META_FEATURED=%q\n' "$(frontmatter_value "$frontmatter" featured)"
  } > "$meta_dir/$slug.sh"

  printf '%s\n' "$body" > "$staging_dir/$year-01-01 $slug.md"
  count=$((count + 1))
done

if ((count == 0)); then
  echo "error: no projects found in $content_dir" >&2
  exit 1
fi
