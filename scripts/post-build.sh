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

for meta in "${metas[@]}"; do
  # shellcheck source=/dev/null
  source "$meta"

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
rmdir "$DIST/post" 2>/dev/null || true
rm -rf "$DIST/page" "$DIST/tag"
rm -f "$DIST/feed.xml"

mkdir -p "$DIST/assets"
cp -R "$SITE_ROOT/assets/." "$DIST/assets/"

"$SITE_ROOT/layouts/home.sh" > "$DIST/index.html"

if [[ ! -s $DIST/index.html ]]; then
  echo "error: the front page was not emitted" >&2
  exit 1
fi
