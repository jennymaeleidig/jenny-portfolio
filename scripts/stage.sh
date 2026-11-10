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

  body=$(frontmatter_body "$file")

  year=
  status=
  category=
  cover=
  order=
  featured=
  publication=
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
          publication) publication=$value ;;
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
        is_http_url "$extra" || fail "$name" "link '$value' must be an http(s) URL"
        # A link's key is the text it prints as, so the build has nothing to
        # translate and no vocabulary to keep. frontmatter.sh has already
        # refused any key that is not a plain label.
        links+=("$value=$extra")
        ;;
      invalid)
        fail "$name" "cannot parse frontmatter line: $key"
        ;;
    esac
  done < <(frontmatter_records "$file")

  if [[ ! $year =~ ^[0-9]{4}$ ]]; then
    fail "$name" "missing or invalid 'year'"
  fi

  vocabulary_has statuses "$status" || fail "$name" "missing or invalid 'status'"
  vocabulary_has categories "$category" || fail "$name" "missing or invalid 'category'"

  if [[ -n $order && ! $order =~ ^[0-9]+$ ]]; then
    fail "$name" "'order' must be a whole number"
  fi

  case $featured in
    "" | true | false) ;;
    *) fail "$name" "'featured' must be true or false" ;;
  esac

  if [[ -n $cover ]]; then
    [[ $cover == /* ]] || fail "$name" "'cover' must be an absolute path from /"
    if [[ -n $site_root && ! -f "$site_root$cover" ]]; then
      fail "$name" "'cover' does not exist: $cover"
    fi
  fi

  # An article has no page of its own, so where it was published is the only
  # route to it, and the catalogue row and featured card both use it.
  href="/projects/$slug/"
  if [[ $category == articles ]]; then
    [[ -n $publication ]] || fail "$name" "articles need a 'publication' link"
    is_http_url "$publication" || fail "$name" "'publication' must be an http(s) URL"
    href=$publication
  elif [[ -n $publication ]]; then
    fail "$name" "'publication' is for articles; give this project a link instead"
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
    printf 'META_HREF=%q\n' "$href"
    printf 'META_PUBLICATION=%q\n' "$publication"
    printf 'META_FEATURED=%q\n' "$featured"
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
