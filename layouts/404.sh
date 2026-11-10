#!/usr/bin/env bash
# 404: the way back from a stale link.
set -euo pipefail

# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/lib.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/layouts/shell.sh"

route=${PAGE_ROUTE:-/404/}
page_open "404, page not found" "" "That page does not exist." "$route" false
cat <<'EOF'
        <h1>Page not found</h1>
        <p class="lede">That page does not exist.</p>
EOF
page_close
