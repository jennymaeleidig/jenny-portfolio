#!/usr/bin/env bash
# The shared HTML shell. Sourced by the page layouts.

identity_file=${IDENTITY_FILE:-"$SITE_ROOT/content/identity.sh"}
asset_base=${ASSET_BASE:-/assets}
stylesheet=${STYLESHEET:-$asset_base/site.css}
# shellcheck source=/dev/null
source "$identity_file"

shell_head() {
  local title=$1

  cat <<EOF
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>$title</title>
    <link rel="icon" href="$asset_base/favicon.svg" type="image/svg+xml">
    <link rel="preload" href="$asset_base/fonts/CommitMonoV143-VF.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="$asset_base/reset.css">
    <link rel="stylesheet" href="$stylesheet">
  </head>
  <body$(sky_levers_attr)>
EOF
}

# Development only: a SKY_LEVERS=1 build marks the body and loads the tuning
# panel. Nothing reads either in a production build; see README.
sky_levers_attr() {
  if [[ ${SKY_LEVERS:-} == 1 ]]; then
    printf ' data-sky-levers'
  fi
}

shell_sheet_open() {
  local section=${1:-}
  cat <<EOF
    <div class="sheet">
      <header class="site-header">
        <nav aria-label="Primary">
          <a href="/"$(current_page_attr "$section" home)>$SITE_NAME</a>
          <a href="/work/"$(current_page_attr "$section" work)>Work</a>
          <a href="/about/"$(current_page_attr "$section" about)>About</a>
          <a href="/now/"$(current_page_attr "$section" now)>Now</a>
        </nav>
      </header>
      <main>
EOF
}

shell_main_close() {
  printf '      </main>\n'
  cat <<EOF
      <footer class="site-footer"><a href="mailto:$(html_escape "$EMAIL")">$(html_escape "$EMAIL")</a></footer>
    </div>
EOF
}

page_open() {
  shell_head "$1"
  local section=${2:-}
  cat <<EOF
    <div class="sky" aria-hidden="true">
      <noscript><img class="sky-poster" src="$asset_base/sky-poster.svg" alt="" width="1600" height="1000"></noscript>
      <canvas class="sky-canvas"></canvas>
    </div>
EOF
  shell_sheet_open "$section"
}

page_close() {
  shell_main_close
  cat <<EOF
    <script type="module" src="/assets/sky.js"></script>
EOF
  if [[ ${SKY_LEVERS:-} == 1 ]]; then
    printf '    <script type="module" src="/assets/sky-levers.mjs"></script>\n'
  fi
  cat <<EOF
    <script type="module" src="/assets/nav.js"></script>
  </body>
</html>
EOF
}
