#!/usr/bin/env bash
# jenny's page layout: one project, rendered from its staged markdown and sidecar.
set -euo pipefail

# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/lib.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/projects.sh"
# shellcheck source=/dev/null
source "$SITE_ROOT/layouts/shell.sh"

slug=${POST_URL#/post/}
slug=${slug%.html}

facts=$(project_show "$slug" title category status year cover blurb_text)
IFS=$'\037' read -r raw_title raw_category raw_status year cover blurb_text <<< "$facts"

title=$(html_escape "$raw_title")
category=$(html_escape "$raw_category")
status=$(html_escape "$(vocabulary_label statuses "$raw_status")")

# A project page is the one route jenny renders rather than post-build.sh, so
# it names its own address: the link and the sitemap must agree.
PAGE_ROUTE="/projects/$slug/"
# The record hands over the blurb as plain text, so the layout never has to
# un-render the markup an earlier step produced.
PAGE_DESCRIPTION=$blurb_text

page_open "$title, $SITE_NAME" work
cat <<EOF
        <article>
          <h1>$title</h1>
          <p class="meta">$category &middot; $year &middot; <span class="status">$status</span></p>
EOF

if [[ -n $cover ]]; then
  cat <<EOF
          <figure class="cover"><img src="$(html_escape "$cover")" alt="$title cover"></figure>
EOF
fi

cat <<EOF
          <div class="prose">
$POST_CONTENTS
          </div>
EOF

links=()
while IFS= read -r entry; do
  links+=("$entry")
done < <(project_links "$slug")

if ((${#links[@]})); then
  cat <<EOF
          <ul class="links ruled" aria-label="Links">
EOF
  for entry in "${links[@]}"; do
    IFS=$'\t' read -r link_title link_url <<< "$entry"
    printf '            <li><a href="%s">%s</a></li>\n' "$(html_escape "$link_url")" "$(html_escape "$link_title")"
  done
  printf '          </ul>\n'
fi

tags=()
while IFS= read -r tag; do
  tags+=("$tag")
done < <(project_tags "$slug")

if ((${#tags[@]})); then
  cat <<EOF
          <ul class="tags" aria-label="Tags">
EOF
  for tag in "${tags[@]}"; do
    printf '            <li>%s</li>\n' "$(html_escape "$tag")"
  done
  printf '          </ul>\n'
fi

cat <<EOF
        </article>
EOF
page_close
