#!/usr/bin/env bash
# The career record's facts, read as disclosure records.
#
# The layout renders one disclosure per record; it never switches on a record
# kind to decode a column order, and it never re-reads a file the module has
# already read. `career_section_records` takes the section name and the career
# directory, so its tests cross the same interface the layout does.
#
# A record is unit-separated because a disclosure may have an empty note or no
# body in the middle of its fields:
#
#   disclosure <summary> <location> <dates> <note> <body-file>
#   item       <group>   <skill>
#
# Source: window into the vocabulary entries above; no record is a map, so the
# bash 3.2 floor in ADR-0001 still holds.

# shellcheck source=/dev/null
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

# List one section's entry files. The caller reads each file once and sorts
# the rows it produces.
career_file_list() {
  local dir=$1 file
  shopt -s nullglob
  for file in "$dir"/*.md; do
    printf '%s\n' "$file"
  done
}

# One row per file, newest first by its `start` field, with the filename as a
# tie-breaker. The reader names the fields its section declares and refuses
# anything else, so a typo is a build error rather than an empty line.
career_records() {
  local dir=$1 reader=$2
  shift 2
  local file row first second third start fourth fifth rows
  rows=$(
    while IFS= read -r file; do
      row=$("$reader" "$file" "$@") || exit 1
      # Every section keeps its start date in the fourth field.
      IFS=$'\037' read -r first second third start fourth fifth <<< "$row"
      printf '%s\t%s\t%s\n' "${start:-0000}" "$file" "$row"
    done < <(career_file_list "$dir")
  ) || return 1
  [[ -n $rows ]] || return 0
  printf '%s\n' "$rows" | LC_ALL=C sort -t $'\t' -k1,1r -k2,2 | cut -f3-
}

month_label() {
  case ${1#*-} in
    01) printf 'January' ;;
    02) printf 'February' ;;
    03) printf 'March' ;;
    04) printf 'April' ;;
    05) printf 'May' ;;
    06) printf 'June' ;;
    07) printf 'July' ;;
    08) printf 'August' ;;
    09) printf 'September' ;;
    10) printf 'October' ;;
    11) printf 'November' ;;
    12) printf 'December' ;;
  esac
}

# A career date is a year, a year and month, or `present`. Anything else is
# shown as it was written rather than silently dropped.
date_label() {
  case $1 in
    "" | present | Present) printf 'Present' ;;
    [0-9][0-9][0-9][0-9]) printf '%s' "$1" ;;
    [0-9][0-9][0-9][0-9]-[0-9][0-9]) printf '%s %s' "$(month_label "$1")" "${1%%-*}" ;;
    *) printf '%s' "$1" ;;
  esac
}

date_range() {
  local start=$1 end=$2
  printf '%s – %s' "$(date_label "$start")" "$(date_label "$end")"
}

# One role's declared fields, read once.
career_role_row() {
  local file=$1 identity=$2
  local group='' title='' location='' start='' end='' key value
  while IFS=$'\t' read -r key value; do
    case $key in
      "$identity") group=$value ;;
      title) title=$value ;;
      location) location=$value ;;
      start) start=$value ;;
      end) end=$value ;;
      *)
        echo "error: $file: unknown career field '$key'" >&2
        return 1
        ;;
    esac
  done < <(frontmatter_scalars "$file")
  printf '%s\037%s\037%s\037%s\037%s\037%s\n' \
    "$group" "$title" "$location" "$start" "$end" "$file"
}

# One disclosure per role, grouped by employer or organisation identity rather
# than adjacency, so two stints stay together when another role is dated
# between them. The group's location comes from its newest role.
career_role_records() {
  local dir=$1 identity=$2
  local -a groups=()
  local -a group_rows=()
  local row rows group first location title start end file
  local i found

  rows=$(career_records "$dir" career_role_row "$identity") || return 1
  while IFS= read -r row; do
    [[ -n $row ]] || continue
    IFS=$'\037' read -r group title location start end file <<< "$row"
    found=-1
    for ((i = 0; i < ${#groups[@]}; i++)); do
      if [[ ${groups[i]} == "$group" ]]; then
        found=$i
        break
      fi
    done
    if ((found < 0)); then
      groups+=("$group")
      group_rows+=("$row")
    else
      group_rows[found]+=$'\n'"$row"
    fi
  done <<< "$rows"

  for ((i = 0; i < ${#groups[@]}; i++)); do
    group=${groups[i]}
    first=${group_rows[i]%%$'\n'*}
    IFS=$'\037' read -r _ _ location _ _ _ <<< "$first"
    while IFS= read -r row; do
      [[ -n $row ]] || continue
      IFS=$'\037' read -r _ title _ start end file <<< "$row"
      printf 'disclosure\037%s - %s\037%s\037%s\037\037%s\n' \
        "$title" "$group" "$location" "$(date_range "$start" "$end")" "$file"
    done <<< "${group_rows[i]}"
  done
}

# One qualification's declared fields, read once.
career_education_row() {
  local file=$1
  local institution='' location='' degree='' start='' end='' note='' key value
  while IFS=$'\t' read -r key value; do
    case $key in
      institution) institution=$value ;;
      location) location=$value ;;
      degree) degree=$value ;;
      start) start=$value ;;
      end) end=$value ;;
      note) note=$value ;;
      *)
        echo "error: $file: unknown career field '$key'" >&2
        return 1
        ;;
    esac
  done < <(frontmatter_scalars "$file")
  printf '%s\037%s\037%s\037%s\037%s\037%s\n' \
    "$institution" "$location" "$degree" "$start" "$end" "$note"
}

# One disclosure per qualification, newest first, summarised as degree - school.
career_education_records() {
  local dir=$1
  local row rows institution location degree start end note
  rows=$(career_records "$dir" career_education_row) || return 1
  while IFS= read -r row; do
    [[ -n $row ]] || continue
    IFS=$'\037' read -r institution location degree start end note <<< "$row"
    printf 'disclosure\037%s - %s\037%s\037%s\037%s\037\n' \
      "$degree" "$institution" "$location" "$(date_range "$start" "$end")" "$note"
  done <<< "$rows"
}

# One item per skill. Each category is a bullet of the hand-written
# skills.md of the form `- **Category:** skill, skill, ...`; a comma inside
# parentheses, as in `AWS (S3, EMR, DynamoDB)`, is part of one skill.
career_skill_records() {
  local file=$1
  awk '
    function trim(text) {
      sub(/^[[:space:]]+/, "", text)
      sub(/[[:space:]]+$/, "", text)
      return text
    }
    # Split on commas that sit outside parentheses, so grouped skills survive.
    function emit(items,   i, char, depth, buffer) {
      depth = 0
      buffer = ""
      for (i = 1; i <= length(items); i++) {
        char = substr(items, i, 1)
        if (char == "(") depth++
        if (char == ")" && depth > 0) depth--
        if (char == "," && depth == 0) {
          if (trim(buffer) != "") printf "item\037%s\n", trim(buffer)
          buffer = ""
          continue
        }
        buffer = buffer char
      }
      if (trim(buffer) != "") printf "item\037%s\n", trim(buffer)
    }
    /^- \*\*/ {
      line = $0
      sub(/^- \*\*/, "", line)
      category = line
      sub(/:\*\*.*/, "", category)
      items = line
      sub(/^.*:\*\*[[:space:]]*/, "", items)
      printf "group\037%s\n", category
      emit(items)
    }
  ' "$file"
}

# Emit one section's records. The caller renders a disclosure stream for the
# first three sections and an item stream for skills; the record kinds are the
# module's interface, not a storage detail a layout has to decode.
career_section_records() {
  local section=$1 dir=$2
  case $section in
    experience) career_role_records "$dir/experience" employer ;;
    volunteering) career_role_records "$dir/volunteering" organization ;;
    education) career_education_records "$dir/education" ;;
    skills) career_skill_records "$dir/skills.md" ;;
    *)
      echo "error: unknown career section '$section'" >&2
      return 1
      ;;
  esac
}
