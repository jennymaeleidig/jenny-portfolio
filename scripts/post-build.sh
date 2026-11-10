#!/usr/bin/env bash
# Relocate jenny's output into the site's route table and emit the index.
set -euo pipefail

: "${DIST:?DIST is required}"
: "${META_DIR:?META_DIR is required}"
: "${SITE_ROOT:?SITE_ROOT is required}"

shopt -s nullglob
metas=("$META_DIR"/*.sh)

if ((${#metas[@]} == 0)); then
  echo "error: no staged projects to route" >&2
  exit 1
fi

# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/lib.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/projects.sh"

# Emit one route through its layout. A route is a directory with an
# index.html; the front page is the site root. An empty page fails the build
# rather than shipping.
emit_route() {
  local route=$1 layout=$2 argument=${3:-} page
  if [[ $route == / ]]; then
    page="$DIST/index.html"
  else
    page="$DIST${route%/}/index.html"
  fi
  mkdir -p "$(dirname "$page")"
  # The route is the page's own address, so the head can declare a canonical URL
  # without every layout having to spell it out again.
  if [[ -n $argument ]]; then
    PAGE_ROUTE=$route "$SITE_ROOT/layouts/$layout.sh" "$argument" > "$page"
  else
    PAGE_ROUTE=$route "$SITE_ROOT/layouts/$layout.sh" > "$page"
  fi
  if [[ ! -s $page ]]; then
    echo "error: the $route route was not emitted" >&2
    exit 1
  fi
}

# A project page is one jenny rendered; an article has no page, and the record
# says so. The build moves every publishable page to its route and leaves the
# rest to the catalogue's external link.
while IFS=$'\037' read -r slug publishable; do
  [[ $publishable == true ]] || continue

  rendered="$DIST/post/$slug.html"
  if [[ ! -s $rendered ]]; then
    echo "error: jenny did not emit a page for $slug" >&2
    exit 1
  fi

  destination="$DIST/projects/$slug"
  mkdir -p "$destination"
  mv "$rendered" "$destination/index.html"
done < <(project_records slug publishable)

# Nothing outside the route table survives the post-build step.
rm -rf "$DIST/post" "$DIST/page" "$DIST/tag"
rm -f "$DIST/feed.xml"

mkdir -p "$DIST/assets"
cp -R "$SITE_ROOT/assets/." "$DIST/assets/"

# Decode stdin as base64. BSD's base64 spells it `-D` and coreutils' spells it
# `--decode`, and the build does not get to pick a new tool to depend on.
decode_base64() {
  if base64 --decode </dev/null >/dev/null 2>&1; then
    base64 --decode
  else
    base64 -D
  fi
}

# Share cards. A link preview cannot use an SVG, but the poster stays text-only
# by carrying its pixels as a PNG data URI, so the build unwraps that same image
# into the tree. The share card is then the poster the site already draws.
poster_data=$(grep -o 'data:image/png;base64,[A-Za-z0-9+/=]*' "$DIST/assets/sky-poster.svg" | head -n 1 || true)
if [[ -z $poster_data ]]; then
  echo "error: sky-poster.svg carries no PNG to use as the share card" >&2
  exit 1
fi
printf '%s' "${poster_data#data:image/png;base64,}" | decode_base64 > "$DIST/assets/sky-poster.png"
if [[ ! -s $DIST/assets/sky-poster.png ]]; then
  echo "error: the share card was not written" >&2
  exit 1
fi

# Development only: the levers module is not emitted at all without the flag,
# so a production tree has nothing to load and nothing pointing at it.
if [[ ${SKY_LEVERS:-} != 1 ]]; then
  rm -f "$DIST/assets/sky-levers.mjs"
fi

emit_route / home
emit_route /work/ work

while IFS= read -r category; do
  emit_route "/work/$category/" work "$category"
done < <(vocabulary_words categories)

emit_route /work/career/ career

while IFS= read -r section; do
  emit_route "/work/career/$section/" career "$section"
done < <(vocabulary_words career-sections)

for page in about now; do
  emit_route "/$page/" "$page"
done

# /404 is a route like any other, and GitHub Pages also serves a root 404.html
# for unknown paths, so the same page is emitted at both.
emit_route /404/ 404
cp "$DIST/404/index.html" "$DIST/404.html"

# The sitemap walks what is now on disk, so it cannot drift from the build.
"$SITE_ROOT/scripts/sitemap.sh"
