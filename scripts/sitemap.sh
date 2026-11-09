#!/usr/bin/env bash
# Emit sitemap.xml and robots.txt from the routes the build actually emitted.
# The tree is the route table: a page added anywhere under dist/ appears here
# without touching this script, and a page that was not emitted cannot appear.
set -euo pipefail

: "${DIST:?DIST is required}"
: "${SITE_ROOT:?SITE_ROOT is required}"

# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/lib.sh"

site_host=${SITE_HOST:-${BLOG_HOST:-}}
if [[ -z $site_host ]]; then
  echo "error: SITE_HOST or BLOG_HOST is required to write the sitemap" >&2
  exit 1
fi
site_host=${site_host%/}
# The route is derived by stripping the dist prefix, so a trailing slash on
# DIST would otherwise turn /work/ into work/.
dist=${DIST%/}

routes=$(
  find "$dist" -type f -name index.html | while IFS= read -r file; do
    # /projects/<slug>/index.html -> /projects/<slug>/, /index.html -> /
    route=${file#"$dist"}
    route=${route%index.html}
    [[ -n $route ]] || route=/

    # /404 and its Pages fallback are not destinations, so they are not listed.
    if [[ $route == /404 || $route == /404/ ]]; then
      continue
    fi
    printf '%s\n' "$route"
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
