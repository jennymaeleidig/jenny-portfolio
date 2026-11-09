#!/usr/bin/env bash
# The Work tab bar: Projects and Career are pages, so they are ordinary links
# with the current page marked. Not an ARIA tablist: each tab must survive a
# new tab, a shared URL and a browser without JavaScript.
set -euo pipefail

tab_bar() {
  local current=${1:-projects}
  printf '        <nav class="tab-bar" aria-label="Work sections">\n'
  printf '          <ul>\n'
  printf '            <li><a href="/work/"%s>Projects</a></li>\n' \
    "$(current_page_attr "$current" projects)"
  printf '            <li><a href="/work/career/"%s>Career</a></li>\n' \
    "$(current_page_attr "$current" career)"
  printf '          </ul>\n'
  printf '        </nav>\n'
}
