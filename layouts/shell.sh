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
    <meta name="color-scheme" content="light">
    <title>$title</title>
    <link rel="preload" href="/assets/fonts/CommitMonoV143-VF.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="/assets/reset.css">
    <link rel="stylesheet" href="/assets/site.css">
  </head>
  <body>
    <div class="sheet">
      <header class="site-header">
        <nav aria-label="Primary">
          <a href="/">Jenny Leidig</a>
        </nav>
      </header>
      <main>
EOF
}

page_close() {
  printf '      </main>\n'
  cat <<EOF
      <footer class="site-footer"><a href="/">Jenny Leidig</a></footer>
    </div>
  </body>
</html>
EOF
}
