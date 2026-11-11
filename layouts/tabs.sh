#!/usr/bin/env bash
# The Work tab bar: Projects and Career are pages, so they are ordinary links
# with the current page marked. Not an ARIA tablist: each tab must survive a
# new tab, a shared URL and a browser without JavaScript.
set -euo pipefail

tab_bar() {
  local current=${1:-projects}
  local projects_href career_href
  projects_href=$(route_address work) || return 1
  career_href=$(route_address career) || return 1
  printf '        <nav class="tab-bar" aria-label="Work sections">\n'
  printf '          <ul>\n'
  printf '            <li><a href="%s"%s>Projects</a></li>\n' \
    "$projects_href" "$(current_page_attr "$current" projects)"
  printf '            <li><a href="%s"%s>Career</a></li>\n' \
    "$career_href" "$(current_page_attr "$current" career)"
  printf '          </ul>\n'
  printf '        </nav>\n'
}
