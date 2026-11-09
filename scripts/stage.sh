#!/usr/bin/env bash
# Copy each project into a staging directory in the shape jenny expects:
# a dated filename and plain CommonMark with the title as an H1.
# The frontmatter becomes a shell-sourceable sidecar the layouts read by slug.
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=/dev/null
source "$script_dir/lib.sh"

content_dir=${1:?content directory required}
staging_dir=${2:?staging directory required}
meta_dir=${3:?metadata directory required}
site_root=${4:-}

fail() {
  echo "error: $1: $2" >&2
  exit 1
}

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

# The opening paragraph after the H1 is the project's blurb: enough to make a
# catalogue row worth clicking, and the only prose an article carries.
blurb_of() {
  awk '
    /^#[[:space:]]/ && !heading { heading = 1; next }
    heading && /^[[:space:]]*$/ { if (text != "") exit; next }
    heading { text = (text == "" ? $0 : text " " $0) }
    END { print text }
  '
}

# Flatten the frontmatter into tab-separated records the shell can read:
#   scalar <key> <value>
#   item   <section> <value>
#   pair   <section> <subkey> <value>
# Anything else is reported as invalid rather than silently dropped.
frontmatter_records() {
  printf '%s\n' "$1" | awk '
    function trim(s) {
      sub(/^[[:space:]]+/, "", s)
      sub(/[[:space:]]+$/, "", s)
      return s
    }
    function unquote(s) {
      s = trim(s)
      if (s ~ /^".*"$/ || s ~ /^\047.*\047$/) {
        s = substr(s, 2, length(s) - 2)
      }
      return s
    }
    {
      line = $0
      sub(/\r$/, "", line)
      if (line ~ /^[[:space:]]*(#|$)/) next

      if (line ~ /^[A-Za-z_][A-Za-z0-9_]*:[[:space:]]*$/) {
        section = line
        sub(/:.*/, "", section)
        next
      }

      if (line ~ /^[A-Za-z_][A-Za-z0-9_]*:[[:space:]]/) {
        key = line
        sub(/:.*/, "", key)
        value = line
        sub(/^[^:]*:[[:space:]]*/, "", value)
        if (key == "tags" && value ~ /^\[.*\]$/) {
          count = split(substr(value, 2, length(value) - 2), parts, ",")
          for (i = 1; i <= count; i++) {
            tag = unquote(parts[i])
            if (tag != "") print "item\ttags\t" tag
          }
        } else {
          print "scalar\t" key "\t" unquote(value)
        }
        section = ""
        next
      }

      if (section != "" && line ~ /^[[:space:]]+-[[:space:]]+/) {
        value = line
        sub(/^[[:space:]]+-[[:space:]]+/, "", value)
        print "item\t" section "\t" unquote(value)
        next
      }

      if (section != "" && line ~ /^[[:space:]]+[A-Za-z_][A-Za-z0-9_]*:[[:space:]]/) {
        subkey = line
        sub(/^[[:space:]]+/, "", subkey)
        sub(/:.*/, "", subkey)
        value = line
        sub(/^[[:space:]]+[^:]*:[[:space:]]*/, "", value)
        print "pair\t" section "\t" subkey "\t" unquote(value)
        next
      }

      print "invalid\t" line
    }
  '
}

count=0
shopt -s nullglob

for file in "$content_dir"/*.md; do
  name=$(basename "$file")
  slug=${name%.md}

  if [[ ! $slug =~ ^[a-z0-9-]+$ ]]; then
    fail "$name" "filename must match ^[a-z0-9-]+$"
  fi

  if [[ $(head -n 1 "$file") != "---" ]]; then
    fail "$name" "missing frontmatter"
  fi

  frontmatter=$(frontmatter_of "$file")
  body=$(body_of "$file")

  year=
  status=
  category=
  cover=
  order=
  featured=
  cv=
  cv_blurb=
  tags=()
  links=()

  while IFS=$'\t' read -r kind key value extra; do
    case $kind in
      scalar)
        case $key in
          year) year=$value ;;
          status) status=$value ;;
          category) category=$value ;;
          cover) cover=$value ;;
          order) order=$value ;;
          featured) featured=$value ;;
          cv) cv=$value ;;
          cv_blurb) cv_blurb=$value ;;
          *) fail "$name" "unknown frontmatter field '$key'" ;;
        esac
        ;;
      item)
        [[ $key == tags ]] || fail "$name" "unexpected list under '$key'"
        [[ -n $value ]] || fail "$name" "empty tag in 'tags'"
        tags+=("$value")
        ;;
      pair)
        [[ $key == links ]] || fail "$name" "unexpected mapping under '$key'"
        is_link_kind "$value" || fail "$name" "unknown link kind '$value'"
        [[ $extra =~ ^https?://[^[:space:]]+$ ]] || fail "$name" "link '$value' must be an http(s) URL"
        links+=("$value=$extra")
        ;;
      invalid)
        fail "$name" "cannot parse frontmatter line: $key"
        ;;
    esac
  done < <(frontmatter_records "$frontmatter")

  if [[ ! $year =~ ^[0-9]{4}$ ]]; then
    fail "$name" "missing or invalid 'year'"
  fi

  is_status "$status" || fail "$name" "missing or invalid 'status'"
  is_category "$category" || fail "$name" "missing or invalid 'category'"

  if [[ -n $order && ! $order =~ ^[0-9]+$ ]]; then
    fail "$name" "'order' must be a whole number"
  fi

  case $featured in
    "" | true | false) ;;
    *) fail "$name" "'featured' must be true or false" ;;
  esac

  case $cv in
    "" | true | false) ;;
    *) fail "$name" "'cv' must be true or false" ;;
  esac

  if [[ $cv == true && -z $cv_blurb ]]; then
    fail "$name" "cv: true requires cv_blurb"
  fi

  if [[ -n $cover ]]; then
    [[ $cover == /* ]] || fail "$name" "'cover' must be an absolute path from /"
    if [[ -n $site_root && ! -f "$site_root$cover" ]]; then
      fail "$name" "'cover' does not exist: $cover"
    fi
  fi

  # An article has no page of its own, so its publication link is the only
  # route to it.
  if [[ $category == articles ]]; then
    publication=
    for entry in "${links[@]}"; do
      case ${entry%%=*} in
        paper | live) publication=1 ;;
      esac
    done
    [[ -n $publication ]] || fail "$name" "articles need a 'paper' or 'live' link"
  fi

  title=
  while IFS= read -r line; do
    if [[ $line =~ ^#[[:space:]]+(.*)$ ]]; then
      title=${BASH_REMATCH[1]}
      break
    fi
  done <<< "$body"
  if [[ -z $title ]]; then
    fail "$name" "missing '# Title' line"
  fi

  blurb=$(printf '%s\n' "$body" | blurb_of)
  blurb_html=$(printf '%s\n' "$blurb" | cmark-gfm --extension table --extension autolink)

  mkdir -p "$meta_dir"
  {
    printf 'META_SLUG=%q\n' "$slug"
    printf 'META_TITLE=%q\n' "$title"
    printf 'META_BLURB=%q\n' "$blurb_html"
    printf 'META_YEAR=%q\n' "$year"
    printf 'META_STATUS=%q\n' "$status"
    printf 'META_CATEGORY=%q\n' "$category"
    printf 'META_COVER=%q\n' "$cover"
    printf 'META_ORDER=%q\n' "$order"
    printf 'META_FEATURED=%q\n' "$featured"
    printf 'META_CV=%q\n' "$cv"
    printf 'META_CV_BLURB=%q\n' "$cv_blurb"
    printf 'META_TAGS=('
    if ((${#tags[@]})); then
      printf '%q ' "${tags[@]}"
    fi
    printf ')\n'
    printf 'META_LINKS=('
    if ((${#links[@]})); then
      printf '%q ' "${links[@]}"
    fi
    printf ')\n'
  } > "$meta_dir/$slug.sh"

  if [[ $category != articles ]]; then
    printf '%s\n' "$body" > "$staging_dir/$year-01-01 $slug.md"
  fi
  count=$((count + 1))
done

if ((count == 0)); then
  echo "error: no projects found in $content_dir" >&2
  exit 1
fi
