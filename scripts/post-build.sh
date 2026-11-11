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
source "$SITE_ROOT/scripts/routes.sh"

# Render one layout route to the output path the route table chose. The route
# is the page's own address, so the head can declare a canonical URL without
# every layout having to spell it out again. The renderer passes the address
# and its indexability as the layout's first two arguments; a layout's own
# optional argument is the third. An empty page fails the build rather than
# shipping.
render_route() {
  local address=$1 output=$2 layout=$3 argument=${4:-} indexable=$5
  mkdir -p "$(dirname "$output")"
  "$SITE_ROOT/layouts/$layout.sh" "$address" "$indexable" "$argument" > "$output"
  if [[ ! -s $output ]]; then
    echo "error: the $address route was not emitted" >&2
    exit 1
  fi
}

# The feed is out of scope; jenny's feed and its extra route trees are
# discarded after the route table has moved the project pages out of post/.
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

# One route table drives both jobs: a layout route is rendered here, and a
# project route is the page jenny already rendered, moved to the address the
# record names. An article has no page, so it has no route to move.
while IFS=$'\037' read -r kind address output indexable layout argument source; do
  case $kind in
    layout) render_route "$address" "$output" "$layout" "$argument" "$indexable" ;;
    project)
      if [[ ! -s $source ]]; then
        echo "error: jenny did not emit a page for $address" >&2
        exit 1
      fi
      mkdir -p "$(dirname "$output")"
      mv "$source" "$output"
      ;;
  esac
done < <(route_records kind address output indexable layout argument source)

# Nothing outside the route table survives the post-build step.
rm -rf "$DIST/post" "$DIST/page" "$DIST/tag"

# /404 is a route like any other, and GitHub Pages also serves a root 404.html
# for unknown paths, so the same page is emitted at both.
cp "$DIST/404/index.html" "$DIST/404.html"

# The sitemap reads the same route table the renderer just walked, so a page
# cannot be published at an address the table does not know.
"$SITE_ROOT/scripts/sitemap.sh"
