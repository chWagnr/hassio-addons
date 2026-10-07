#!/usr/bin/env bash
set -euo pipefail

for addon in certflow papra tandoor-mcp; do
  config_file="${addon}/config.yaml"
  version="$(sed -n 's/^version: "\(.*\)"$/\1/p' "${config_file}")"
  if [ -z "${version}" ]; then
    echo "Unable to read the version from ${config_file}." >&2
    exit 1
  fi

  case "${addon}" in
    certflow) display_name="CertFlow" ;;
    papra) display_name="Papra" ;;
    tandoor-mcp) display_name="Tandoor MCP" ;;
  esac
  changelog_file="${addon}/CHANGELOG.md"
  if grep -qE "^## \[${version//./\\.}\]([[:space:]]|$)" "${changelog_file}"; then
    echo "${addon}: release notes for ${version} already exist; skipping."
    continue
  fi

  # Start after the version currently recorded in this add-on's
  # changelog, so changes are listed exactly once.
  previous_version="$(sed -n '/^## \[Unreleased\]$/d; s/^## \[\([^]]*\)\].*/\1/p' "${changelog_file}" | sed -n '1p')"
  baseline_commit=""
  if [ -n "${previous_version}" ]; then
    # -G also matches the removal of the previous version in the
    # current version-bump commit. Select the commit that added it,
    # so the current bump remains part of the changelog range.
    while read -r candidate; do
      patch="$(git show --format= --unified=0 "${candidate}" -- "${config_file}")"
      if grep -Fqx "+version: \"${previous_version}\"" <<< "${patch}"; then
        baseline_commit="${candidate}"
        break
      fi
    done < <(git log -G "^version: \"${previous_version}\"$" --format=%H -- "${config_file}")
  fi
  commit_range="${baseline_commit:+${baseline_commit}..}HEAD"

  notes_file="$(mktemp)"
  {
    echo "## ${display_name} ${version}"
    echo
    echo "### Änderungen"
    git log --no-merges \
      --format="- %s ([%h](https://github.com/${GITHUB_REPOSITORY}/commit/%H))" \
      "${commit_range}" -- "${addon}" ":(exclude)${changelog_file}"
  } > "${notes_file}"

  if ! grep -q '^-' "${notes_file}"; then
    echo "No commits found for ${addon} ${version}; add release notes manually." >&2
    exit 1
  fi

  changelog_entry="$(mktemp)"
  {
    echo "## [${version}] - $(date -u +%F)"
    echo
    sed '1,2d' "${notes_file}"
    echo
  } > "${changelog_entry}"

  updated_changelog="$(mktemp)"
  awk -v entry="${changelog_entry}" '
    function insert_entry( line) {
      while ((getline line < entry) > 0) print line
      close(entry)
      inserted = 1
    }
    /^## \[Unreleased\]$/ { in_unreleased = 1; print; next }
    in_unreleased && /^## \[/ && !inserted { insert_entry() }
    { print }
    END { if (in_unreleased && !inserted) insert_entry() }
  ' "${changelog_file}" > "${updated_changelog}"
  mv "${updated_changelog}" "${changelog_file}"
  rm -f "${notes_file}" "${changelog_entry}"

done

