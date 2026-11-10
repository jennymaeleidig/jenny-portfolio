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
  if [[ -n $argument ]]; then
    "$SITE_ROOT/layouts/$layout.sh" "$argument" > "$page"
  else
    "$SITE_ROOT/layouts/$layout.sh" > "$page"
  fi
  if [[ ! -s $page ]]; then
    echo "error: the $route route was not emitted" >&2
    exit 1
  fi
}

for meta in "${metas[@]}"; do
  # shellcheck source=/dev/null
  source "$meta"

  # An article links out to its publication and has no page of its own.
  if [[ $META_CATEGORY == articles ]]; then
    continue
  fi

  rendered="$DIST/post/$META_SLUG.html"
  if [[ ! -s $rendered ]]; then
    echo "error: jenny did not emit a page for $META_SLUG" >&2
    exit 1
  fi

  destination="$DIST/projects/$META_SLUG"
  mkdir -p "$destination"
  mv "$rendered" "$destination/index.html"
done

# Nothing outside the route table survives the post-build step.
rm -rf "$DIST/post" "$DIST/page" "$DIST/tag"
rm -f "$DIST/feed.xml"

mkdir -p "$DIST/assets"
cp -R "$SITE_ROOT/assets/." "$DIST/assets/"

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
