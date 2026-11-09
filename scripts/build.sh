#!/usr/bin/env bash
# Build the site into a deployable tree.
set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
dist_arg=${1:-"$root/dist"}

if [[ $dist_arg = /* ]]; then
  dist=$dist_arg
else
  dist="$PWD/$dist_arg"
fi

if [[ -z $dist || $dist == "/" || $dist == "$root" ]]; then
  echo "error: refusing to clean $dist" >&2
  exit 1
fi

content_dir=${CONTENT_DIR:-"$root/content/projects"}

if ! command -v cmark-gfm >/dev/null 2>&1; then
  echo "error: cmark-gfm is required, install it with 'brew install cmark-gfm' or 'apt install cmark-gfm'" >&2
  exit 1
fi

# jenny expects GNU tools. Fail here rather than letting jenny print a warning
# and exit successfully without building anything.
if [[ $(uname -s) == Darwin ]]; then
  for tool in gsed gawk ggrep gdate; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      echo "error: jenny needs GNU $tool; install it with 'brew install gawk gnu-sed grep coreutils'" >&2
      exit 1
    fi
  done
fi

# The build owns its output directory. A deleted page must not survive a rebuild.
rm -rf "$dist"
mkdir -p "$dist"

staging=$(mktemp -d "${TMPDIR:-/tmp}/portfolio-build.XXXXXX")
cleanup() {
  rm -rf "$staging"
}
trap cleanup EXIT

meta_dir="$staging/.meta"
mkdir -p "$meta_dir"

# The identity file owns the site's name and host. IDENTITY_FILE lets a test
# site supply its own, the same way the layouts do.
identity_file=${IDENTITY_FILE:-"$root/content/identity.sh"}
# shellcheck source=/dev/null
source "$identity_file"

"$root/scripts/stage.sh" "$content_dir" "$staging" "$meta_dir" "$root"

cat > "$staging/.blogrc" <<EOF
export BLOG_HOST=$(printf '%q' "$PORTFOLIO")
export SITE_HOST=$(printf '%q' "$PORTFOLIO")
export BLOG_TITLE=$(printf '%q' "$SITE_NAME")
export POSTS_PER_PAGE=1000
export SUPPRESS_UTILS_WARN=1
export DIST=$(printf '%q' "$dist")
export LAYOUT_DIR=$(printf '%q' "$root/layouts")
export MARKDOWN_COMMAND='cmark-gfm --extension table --extension autolink'
export SITE_ROOT=$(printf '%q' "$root")
export META_DIR=$(printf '%q' "$meta_dir")
# Development only: the sky's tuning levers. Empty in a normal build, so the
# layouts emit neither the panel's script tag nor the body attribute.
export SKY_LEVERS=$(printf '%q' "${SKY_LEVERS:-}")

function post_hook() {
  "\$SITE_ROOT/scripts/post-build.sh" || exit 1
}
EOF

(
  cd "$staging"
  SUPPRESS_UTILS_WARN=1 "$root/vendor/jenny/bin/jenny" -n
)
