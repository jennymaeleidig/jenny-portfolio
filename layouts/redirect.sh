#!/usr/bin/env bash
# One redirect page: an address that forwards to a real one. The renderer
# passes the address, the indexable flag and the target, and the target is
# the route's own argument. The page claims no address of its own: it is not
# indexable, and its canonical URL points at the target.
set -euo pipefail

# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/lib.sh"

route=${1:?a route is required}
indexable=${2:?an indexable flag is required}
target=${3:?a target address is required}
if [[ $indexable != false ]]; then
  echo "error: a redirect must not be indexable" >&2
  exit 1
fi

site=${SITE_HOST:-${BLOG_HOST:-}}
if [[ -z $site ]]; then
  echo "error: SITE_HOST or BLOG_HOST is required to address a page" >&2
  exit 1
fi
site=${site%/}

route_html=$(html_escape "$route")
target_html=$(html_escape "$target")
canonical_html=$(html_escape "$site$target")

cat <<EOF
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>$route_html has moved</title>
    <meta http-equiv="refresh" content="0; url=$target_html">
    <link rel="canonical" href="$canonical_html">
    <meta name="robots" content="noindex">
  </head>
  <body>
    <p>This page has moved. <a href="$target_html">Continue</a> to the new
    address.</p>
  </body>
</html>
EOF
