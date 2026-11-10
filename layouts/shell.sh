#!/usr/bin/env bash
# The shared HTML shell. Sourced by the page layouts.

identity_file=${IDENTITY_FILE:-"$SITE_ROOT/content/identity.sh"}
asset_base=${ASSET_BASE:-/assets}
stylesheet=${STYLESHEET:-$asset_base/site.css}
# The shell escapes and composes with the shared helpers, so it reads them
# itself rather than relying on every caller to source lib.sh first.
# shellcheck source=/dev/null
source "$SITE_ROOT/scripts/lib.sh"
# shellcheck source=/dev/null
source "$identity_file"

# The page head takes raw text: the title and description are composed and
# escaped here, once, and the route the build emitted the page at is an
# argument rather than ambient state. A layout never pre-escapes a title,
# appends the site suffix, or un-renders prose for a meta tag.
shell_head() {
  local raw_title=$1 raw_description=$2 route=$3 indexable=$4
  # The host the sitemap writes against, so a page's canonical URL and its
  # sitemap entry cannot disagree. A page with nowhere to point is a build
  # error, the same as a build with no host to write a sitemap for.
  local site=${SITE_HOST:-${BLOG_HOST:-}}
  if [[ -z $site ]]; then
    echo "error: SITE_HOST or BLOG_HOST is required to address a page" >&2
    exit 1
  fi
  site=${site%/}
  if [[ -z $raw_title ]]; then
    echo "error: a page needs a title" >&2
    exit 1
  fi
  if [[ -z $raw_description ]]; then
    echo "error: a page needs a description" >&2
    exit 1
  fi
  if [[ -z $route ]]; then
    echo "error: a page needs the route it was emitted at" >&2
    exit 1
  fi
  case $indexable in
    true | false) ;;
    *)
      echo "error: indexable must be true or false, not '$indexable'" >&2
      exit 1
      ;;
  esac
  # The front page's title is the site name, so it stands alone; every other
  # page carries the site suffix. The share card shows the page's own title,
  # since og:site_name already names the site.
  local title
  if [[ $raw_title == "$SITE_NAME" ]]; then
    title=$raw_title
  else
    title="$raw_title, $SITE_NAME"
  fi
  title=$(html_escape "$title")
  local share_title
  share_title=$(html_escape "$raw_title")
  # A page's description is one line of prose — the tagline, an opening
  # paragraph, a project's blurb — handed over raw and escaped once here.
  local description
  description=$(html_escape "$raw_description")
  local site_name
  site_name=$(html_escape "$SITE_NAME")
  # The share card is the poster's pixels as a PNG, at the poster frame's size;
  # see scripts/post-build.sh. tests/assets.test.mjs reads the emitted PNG and
  # fails if these numbers drift from it.
  local share_width=720
  local share_height=450
  local share_alt="A pixelated cloud bank drifting across a blue sky."
  local image="$site$asset_base/sky-poster.png"
  local canonical=""

  # The 404 answers a URL that has no page, so it claims no address of its own
  # and asks not to be indexed instead.
  if [[ $indexable == true ]]; then
    canonical="$site$route"
  fi

  cat <<EOF
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>$title</title>
    <meta name="description" content="$description">
    <meta property="og:site_name" content="$site_name">
    <meta property="og:title" content="$share_title">
    <meta property="og:description" content="$description">
    <meta property="og:type" content="website">
EOF

  if [[ -n $canonical ]]; then
    printf '    <link rel="canonical" href="%s">\n' "$canonical"
    printf '    <meta property="og:url" content="%s">\n' "$canonical"
  else
    printf '    <meta name="robots" content="noindex">\n'
  fi

  cat <<EOF
    <meta property="og:image" content="$image">
    <meta property="og:image:type" content="image/png">
    <meta property="og:image:width" content="$share_width">
    <meta property="og:image:height" content="$share_height">
    <meta property="og:image:alt" content="$share_alt">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="$share_title">
    <meta name="twitter:description" content="$description">
    <meta name="twitter:image" content="$image">
    <meta name="twitter:image:alt" content="$share_alt">
    <link rel="icon" href="$asset_base/favicon.png" type="image/png">
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
  local title=$1 section=${2:-} description=${3:-} route=${4:-} indexable=${5:?page_open needs an indexable flag}
  shell_head "$title" "$description" "$route" "$indexable"
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
