#!/usr/bin/env bash
# Run career-ops' own checkers against the generated career-data mirror.
#
# Opt-in: this needs a local checkout of jennymaeleidig/career-ops, so it is
# not part of `make test`.
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
root=$(cd -- "$script_dir/.." && pwd)

career_ops=${CAREER_OPS_DIR:-${1:-}}
if [[ -z $career_ops ]]; then
  echo "error: set CAREER_OPS_DIR (or pass it as the first argument) to a checkout of jennymaeleidig/career-ops" >&2
  exit 1
fi
career_ops=$(cd -- "$career_ops" && pwd)

mirror=${MIRROR_DIR:-"$root/build/career-data"}
if [[ $mirror != /* ]]; then
  mirror="$PWD/$mirror"
fi

"$script_dir/career-data.sh" "$mirror"

profile="$mirror/config/profile.yml"
status=0

run() {
  printf '+'
  printf ' %q' "$@"
  printf '\n'
  "$@" || status=1
}

run env CAREER_OPS_ROOT="$mirror" node "$career_ops/cv-sync-check.mjs"
run node "$career_ops/validate-profile.mjs" --profile "$profile"

# verify-cv-facts.mjs compares a generated document against cv.md and
# article-digest.md. Here cv.md is the generated document, and there is no
# older source to hold it to, so running it would compare the file to itself.
# It is deliberately not run; the mirror is the source, not a tailored CV.

exit "$status"
