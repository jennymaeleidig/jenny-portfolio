#!/usr/bin/env bash
# Emit the resume's markdown and PDF exports from the same records the page
# uses. The PDF is the curated selection; the page and markdown are complete.
set -euo pipefail

: "${DIST:?DIST is required}"
: "${SITE_ROOT:?SITE_ROOT is required}"

resume_dir=${RESUME_DIR:-"$SITE_ROOT/content/resume"}
print_html="$DIST/resume-print.html"
print_css="$DIST/resume-print.css"
pdf="$DIST/resume.pdf"

cleanup() {
  rm -f "$print_html" "$print_css"
}
trap cleanup EXIT

RESUME_DIR="$resume_dir" "$SITE_ROOT/layouts/resume-md.sh" > "$DIST/resume.md"

if [[ ! -s $DIST/resume.md ]]; then
  echo "error: resume.md was not emitted" >&2
  exit 1
fi

# The markdown is part of every build. The PDF needs headless Chrome, and a
# fixture build can skip it with RESUME_PDF=0.
if [[ ${RESUME_PDF:-1} == 0 ]]; then
  exit 0
fi

# shellcheck source=/dev/null
source "$resume_dir/contact.sh"
# shellcheck source=/dev/null
source "$resume_dir/print.sh"

chrome=${CHROME:-}
if [[ -z $chrome ]]; then
  for candidate in \
    google-chrome \
    google-chrome-stable \
    chromium \
    chromium-browser \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
    if command -v "$candidate" >/dev/null 2>&1; then
      chrome=$(command -v "$candidate")
      break
    fi
  done
fi

if [[ -z $chrome ]]; then
  echo "error: headless Chrome is required to print resume.pdf; set CHROME to its path" >&2
  exit 1
fi

# The print copy lives at the root of dist, so its asset references are
# relative and resolve under file://. The page itself keeps absolute /assets.
sed 's#/assets/#assets/#g' "$DIST/assets/site.css" > "$print_css"
RESUME_DIR="$resume_dir" \
  RESUME_OMIT_ENTRIES="${PRINT_OMIT_ENTRIES[*]:-}" \
  RESUME_PHONE="${PHONE:?content/resume/contact.sh must define PHONE}" \
  ASSET_BASE=assets \
  STYLESHEET=resume-print.css \
  "$SITE_ROOT/layouts/resume.sh" > "$print_html"

if [[ -n ${RESUME_PRINT_COPY:-} ]]; then
  cp "$print_html" "$RESUME_PRINT_COPY"
fi

"$chrome" \
  --headless \
  --disable-gpu \
  --disable-dev-shm-usage \
  --no-sandbox \
  --no-pdf-header-footer \
  --disable-javascript \
  --virtual-time-budget=1000 \
  --print-to-pdf="$pdf" \
  "file://$print_html" >/dev/null 2>&1

if [[ ! -s $pdf ]]; then
  echo "error: resume.pdf was not printed" >&2
  exit 1
fi

# The root Pages node carries the total; any nested page tree carries a
# smaller count. The largest /Count is therefore the page count.
pages=$(grep -a -o '/Count[[:space:]]*[0-9][0-9]*' "$pdf" | grep -o '[0-9][0-9]*' | sort -nr | head -n 1 || true)
if [[ -z $pages ]]; then
  echo "error: could not read the page count from resume.pdf" >&2
  exit 1
fi

if ((pages > 2)); then
  rm -f "$pdf"
  echo "error: resume.pdf is $pages pages; the selection must fit two" >&2
  exit 1
fi
