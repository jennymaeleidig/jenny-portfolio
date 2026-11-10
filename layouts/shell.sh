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
        $(swatch_strip)
      </header>
      <main>
EOF
}

shell_main_close() {
  printf '      </main>\n'
  # Citations in this tree follow the Joint Declaration of Data Citation
  # Principles (FORCE11): name every contributor, pin a version or commit, and
  # give a stable locator, so a reader can check the claim and not just the
  # credit. That is the yardstick for the source comments in this repo, not a
  # source in its own right.
  #
  # Applied here: no page lists its sources yet, so a claim that rests on data
  # has nowhere to point. When one is added, it names the data and its locator.
  cat <<EOF
      <footer class="site-footer"><a href="mailto:$(html_escape "$EMAIL")">$(html_escape "$EMAIL")</a>$(swatch_strip)</footer>
    </div>
EOF
}

# The palette strip: eight empty squares. site.css paints them in token
# order, so the colours stay in one place and the markup carries none. The
# strip is decoration, so it is hidden from assistive technology.
swatch_strip() {
  local i
  printf '<div class="swatches" aria-hidden="true">'
  for i in 1 2 3 4 5 6 7 8; do
    printf '<span></span>'
  done
  printf '</div>'
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
