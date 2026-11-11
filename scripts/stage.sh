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
      link)
        is_http_url "$extra" || fail "$name" "link '$value' must be an http(s) URL"
        # The title is the text the page prints, so there is nothing to
        # translate and no vocabulary to keep. frontmatter.sh has already
        # refused a title that is not one quoted YAML line. A tab separates
        # the two fields in the sidecar; the parser refuses tabs in a title.
        links+=("$value"$'\t'"$extra")
        ;;
      pair)
        if [[ $key == links ]]; then
          fail "$name" "links are a list of title/url records now; see docs/project.md"
        fi
        fail "$name" "unexpected mapping under '$key'"
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
  # route to it. The record derives the catalogue href from this rule; the
  # sidecar carries the facts, not the address.
  if [[ $category == articles ]]; then
    [[ -n $publication ]] || fail "$name" "articles need a 'publication' link"
    is_http_url "$publication" || fail "$name" "'publication' must be an http(s) URL"
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

  # The opening paragraph after the H1 is the project's blurb: enough to make
  # a catalogue row worth clicking, and the only prose an article carries.
  blurb=$(printf '%s\n' "$body" | opening_paragraph)
  blurb_html=$(printf '%s\n' "$blurb" | render_markdown)
  blurb_text=$(printf '%s\n' "$blurb_html" | prose_text)

  mkdir -p "$meta_dir"
  {
    printf 'META_SLUG=%s\n' "$(shell_quote "$slug")"
    printf 'META_TITLE=%s\n' "$(shell_quote "$title")"
    printf 'META_BLURB=%s\n' "$(shell_quote "$blurb_html")"
    printf 'META_BLURB_TEXT=%s\n' "$(shell_quote "$blurb_text")"
    printf 'META_YEAR=%s\n' "$(shell_quote "$year")"
    printf 'META_STATUS=%s\n' "$(shell_quote "$status")"
    printf 'META_CATEGORY=%s\n' "$(shell_quote "$category")"
    printf 'META_COVER=%s\n' "$(shell_quote "$cover")"
    printf 'META_ORDER=%s\n' "$(shell_quote "$order")"
    printf 'META_PUBLICATION=%s\n' "$(shell_quote "$publication")"
    printf 'META_FEATURED=%s\n' "$(shell_quote "$featured")"
    printf 'META_TAGS=('
    if ((${#tags[@]})); then
      for entry in "${tags[@]}"; do
        printf '%s ' "$(shell_quote "$entry")"
      done
    fi
    printf ')\n'
    printf 'META_LINKS=('
    if ((${#links[@]})); then
      for entry in "${links[@]}"; do
        printf '%s ' "$(shell_quote "$entry")"
      done
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
