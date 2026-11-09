#!/usr/bin/env bash
# The shared HTML shell. Sourced by the page layouts.

page_open() {
  local title=$1

  cat <<EOF
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>$title</title>
    <link rel="stylesheet" href="/assets/site.css">
  </head>
  <body>
    <div class="sheet">
      <header class="site-header"><a href="/">Jenny Leidig</a></header>
      <main>
EOF
}

page_close() {
  local footer=${1:-}

  printf '      </main>\n'
  if [[ -n $footer ]]; then
    printf '      <footer class="site-footer">%s</footer>\n' "$footer"
  fi
  cat <<EOF
    </div>
  </body>
</html>
EOF
}
