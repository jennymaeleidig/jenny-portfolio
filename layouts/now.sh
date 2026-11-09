#!/usr/bin/env bash
# Now: hand-written prose with the date it was last changed.
set -euo pipefail

# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/lib.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/layouts/shell.sh"

now="$SITE_ROOT/content/now.md"
updated=$(frontmatter_value "$now" updated)
body=$(markdown_body "$now")

page_open "Now, Jenny Leidig"
cat <<EOF
        <h1>Now</h1>
        <p class="meta">Last updated $(html_escape "$updated")</p>
        <div class="prose">
$body
        </div>
EOF
page_close
