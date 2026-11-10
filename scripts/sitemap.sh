#!/usr/bin/env bash
# Emit sitemap.xml and robots.txt from the route table.
# The route table is the one address authority: a page that is not a route
# cannot appear here, and a route carries whether it is indexable. A test
# compares this list with the pages on disk, so the two cannot drift silently.
set -euo pipefail

: "${DIST:?DIST is required}"
: "${META_DIR:?META_DIR is required}"
: "${SITE_ROOT:?SITE_ROOT is required}"

# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/routes.sh"

site_host=${SITE_HOST:-${BLOG_HOST:-}}
if [[ -z $site_host ]]; then
  echo "error: SITE_HOST or BLOG_HOST is required to write the sitemap" >&2
  exit 1
fi
site_host=${site_host%/}
# The sitemap lists every indexable address in the route table, sorted.
routes=$(
  route_records address indexable | while IFS=$'\037' read -r address indexable; do
    [[ $indexable == true ]] || continue
    printf '%s\n' "$address"
  done | LC_ALL=C sort
)

if [[ -z $routes ]]; then
  echo "error: no routes were emitted, so there is no sitemap to write" >&2
  exit 1
fi

{
  printf '<?xml version="1.0" encoding="UTF-8"?>\n'
  printf '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  while IFS= read -r route; do
    printf '  <url><loc>%s%s</loc></url>\n' \
      "$(html_escape "$site_host")" "$(html_escape "$route")"
  done <<< "$routes"
  printf '</urlset>\n'
} > "$DIST/sitemap.xml"

if [[ ! -s $DIST/sitemap.xml ]]; then
  echo "error: sitemap.xml was not emitted" >&2
  exit 1
fi

cat > "$DIST/robots.txt" <<EOF
User-agent: *
Allow: /

Sitemap: $site_host/sitemap.xml
EOF

if [[ ! -s $DIST/robots.txt ]]; then
  echo "error: robots.txt was not emitted" >&2
  exit 1
fi
