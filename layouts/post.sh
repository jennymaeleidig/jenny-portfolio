#!/usr/bin/env bash
# jenny's page layout: one project, rendered from its staged markdown and sidecar.
set -euo pipefail

# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/lib.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/layouts/shell.sh"

slug=${POST_URL#/post/}
slug=${slug%.html}

meta="$META_DIR/$slug.sh"
if [[ ! -f $meta ]]; then
  echo "error: no metadata for $slug" >&2
  exit 1
fi

# shellcheck source=/dev/null
source "$meta"

title=$(html_escape "$POST_TITLE")
category=$(html_escape "$META_CATEGORY")

page_open "$title, Jenny Leidig"
cat <<EOF
        <article>
          <p class="meta">$category &middot; $META_YEAR</p>
          <h1>$title</h1>
$POST_CONTENTS
        </article>
EOF
page_close
