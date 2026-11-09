#!/usr/bin/env bash
# About: hand-written prose, a photo, and the identity links.
set -euo pipefail

# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/lib.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/layouts/shell.sh"

about="$SITE_ROOT/content/about.md"
photo=$(frontmatter_value "$about" photo)
body=$(markdown_body "$about")

if [[ -n $photo && ! -f "$SITE_ROOT$photo" ]]; then
  echo "error: the About photo does not exist: $photo" >&2
  exit 1
fi

render_links() {
  local entry label url
  for entry in "$@"; do
    label=${entry%%=*}
    url=${entry#*=}
    printf '          <li><a href="%s">%s</a></li>\n' "$(html_escape "$url")" "$(html_escape "$label")"
  done
}

page_open "About, Jenny Leidig"
cat <<EOF
        <h1>About</h1>
        <img class="portrait" src="$(html_escape "$photo")" alt="Jenny Leidig">
        <div class="prose">
$body
        </div>
        <ul class="links primary-links" aria-label="Primary links">
EOF
render_links "${PRIMARY_LINKS[@]}"
cat <<EOF
        </ul>
        <ul class="links elsewhere" aria-label="Elsewhere">
EOF
render_links "${ELSEWHERE_LINKS[@]}"
cat <<EOF
        </ul>
        <p class="contribution">I also contributed to the <a href="$(html_escape "$HOMESTUCK")">Unofficial Homestuck Collection web edition</a>, a fork that brings the archive to the browser.</p>
EOF
page_close
