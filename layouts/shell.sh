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
    <link rel="preload" href="$asset_base/fonts/CommitMonoV143-VF.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="$asset_base/reset.css">
    <link rel="stylesheet" href="$stylesheet">
  </head>
  <body>
EOF
}

shell_sheet_open() {
  cat <<EOF
    <div class="sheet">
      <header class="site-header">
        <nav aria-label="Primary">
          <a href="/">Jenny Leidig</a>
          <a href="/work/">Work</a>
          <a href="/resume/">Resume</a>
          <a href="/about/">About</a>
          <a href="/now/">Now</a>
        </nav>
      </header>
      <main>
EOF
}

shell_main_close() {
  printf '      </main>\n'
  cat <<EOF
      <footer class="site-footer"><a href="/">Jenny Leidig</a> <a href="mailto:$(html_escape "$EMAIL")">$(html_escape "$EMAIL")</a></footer>
    </div>
EOF
}

page_open() {
  shell_head "$1"
  cat <<EOF
    <div class="sky" aria-hidden="true">
      <noscript><img class="sky-poster" src="$asset_base/sky-poster.svg" alt="" width="1600" height="1000"></noscript>
      <canvas class="sky-canvas"></canvas>
    </div>
EOF
  shell_sheet_open
}

page_close() {
  shell_main_close
  cat <<EOF
    <script type="module" src="/assets/sky.js"></script>
    <script type="module" src="/assets/nav.js"></script>
  </body>
</html>
EOF
}

# The same shell with no sky and no scripts, for pages that must print and
# scan cleanly. The resume carries everything in markup, so nothing here
# depends on JavaScript.
page_open_plain() {
  shell_head "$1"
  shell_sheet_open
}

page_close_plain() {
  shell_main_close
  cat <<EOF
  </body>
</html>
EOF
}
