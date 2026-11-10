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

title=$(html_escape "$META_TITLE")
category=$(html_escape "$META_CATEGORY")
status=$(html_escape "$(vocabulary_label statuses "$META_STATUS")")

# A project page is the one route jenny renders rather than post-build.sh, so
# it names its own address: the link and the sitemap must agree.
PAGE_ROUTE="/projects/$slug/"
# META_BLURB is the blurb as cmark rendered it, which is why prose_text strips
# markup here. The sidecar is a project page's only source for its opening
# paragraph.
PAGE_DESCRIPTION=$(printf '%s\n' "$META_BLURB" | prose_text)

page_open "$title, $SITE_NAME" work
cat <<EOF
        <article>
          <h1>$title</h1>
          <p class="meta">$category &middot; $META_YEAR &middot; <span class="status">$status</span></p>
EOF

if [[ -n ${META_COVER:-} ]]; then
  cat <<EOF
          <figure class="cover"><img src="$(html_escape "$META_COVER")" alt="$title cover"></figure>
EOF
fi

cat <<EOF
          <div class="prose">
$POST_CONTENTS
          </div>
EOF

if ((${#META_LINKS[@]})); then
  cat <<EOF
          <ul class="links ruled" aria-label="Links">
EOF
  for entry in "${META_LINKS[@]}"; do
    IFS=$'\t' read -r title url <<< "$entry"
    printf '            <li><a href="%s">%s</a></li>\n' "$(html_escape "$url")" "$(html_escape "$title")"
  done
  printf '          </ul>\n'
fi

if ((${#META_TAGS[@]})); then
  cat <<EOF
          <ul class="tags" aria-label="Tags">
EOF
  for tag in "${META_TAGS[@]}"; do
    printf '            <li>%s</li>\n' "$(html_escape "$tag")"
  done
  printf '          </ul>\n'
fi

cat <<EOF
        </article>
EOF
page_close
