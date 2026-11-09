#!/usr/bin/env bash
# 404: the way back from a stale link.
set -euo pipefail

# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/lib.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/layouts/shell.sh"

page_open "404, page not found, Jenny Leidig"
cat <<'EOF'
        <h1>Page not found</h1>
        <p class="lede">That page does not exist.</p>
        <p>These pages do:</p>
        <ul class="links" aria-label="Routes back into the site">
          <li><a href="/">Home</a></li>
          <li><a href="/work/">Work</a></li>
          <li><a href="/work/career/">Career</a></li>
          <li><a href="/about/">About</a></li>
          <li><a href="/now/">Now</a></li>
        </ul>
EOF
page_close
