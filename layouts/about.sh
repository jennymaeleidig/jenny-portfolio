#!/usr/bin/env bash
# About: hand-written prose, a photo, and the identity links.
set -euo pipefail

# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/lib.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/layouts/shell.sh"

route=${1:?a route is required}
indexable=${2:?an indexable flag is required}

about=${ABOUT_FILE:-"$SITE_ROOT/content/about.md"}
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

description=$(lead_paragraph "$about")
page_open "About" about "$description" "$route" "$indexable"
cat <<EOF
        <h1>About</h1>
        <img class="portrait" src="$(html_escape "$photo")" alt="$(html_escape "$FULL_NAME")">
        <div class="prose">
$body
        </div>
        <ul class="links primary-links" aria-label="Primary links">
EOF
render_links "${PRIMARY_LINKS[@]}"
cat <<EOF
        </ul>
EOF
page_close
