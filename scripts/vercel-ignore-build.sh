#!/usr/bin/env bash
# Vercel "Ignored Build Step" (wired up in vercel.json → ignoreCommand).
# Vercel's convention: exit 0 = SKIP this build, exit 1 (or more) = BUILD it.
#
# Why this exists. Stromata went over the Hobby Fluid Active CPU allowance in
# Sept 2026, and the biggest lever was how often it deploys: every deployment
# starts with an empty page cache, so crawlers re-render the whole site after
# each one. See CHANGELOG.md 2026-09-29 and 2026-10-04.
#
# PREVIEWS ARE OPT-IN, AND AN UNASKED PUSH MAKES NO DEPLOYMENT AT ALL
#   vercel.json → git.deploymentEnabled lets only the production branch (`release`)
#   and `preview/**` create deployments. That is the real gate: this script can only CANCEL a deployment
#   that already exists, and on 2 Nov 2026 cancelled deployments still counted
#   towards Hobby's 100-a-day cap (shared with Paideia: 137 deployments across
#   the two projects, about 38 of them real builds), which then refused a push.
#   A preview is requested by pushing the commit to a `preview/<name>` branch;
#   see "Vercel usage" in CLAUDE.md. This script is the second gate: a
#   non-production build on any other branch is skipped, so a misconfigured
#   deploymentEnabled falls back to cancelled deployments, not to building
#   every push. The old commit-message tag no longer does anything.
#
# PRODUCTION BUILDS UNLESS THE CHANGE CANNOT AFFECT THE SITE
#   A production commit whose changed files are ALL on the allowlist below
#   skips the build. The weekly analytics digest is the canonical case: a bot
#   commits one Markdown report to main every Monday, which used to wipe the
#   page cache for nothing. A content-pipeline run (queue + staged Markdown +
#   run log) is the other: it changes what Supabase holds, never what is built.
#
#   Every doubt resolves to BUILD: no previous commit, an empty diff, a git
#   error, a path not on the list. A wasted deploy costs a little CPU; a skipped
#   deploy that should have happened leaves the live site out of date.
#
#   Escape hatch: the force-deploy tag in the head commit message builds
#   regardless (for a docs-only commit that must still go out).
#
# THE ALLOWLIST RULE: a path belongs here only if nothing the PUBLIC site builds
# or serves reads it. Not "it is a script" or "it is a log" — grep first. For
# example scripts/analytics/aggregate.mjs is NOT listed: lib/analytics/dashboard.ts
# imports it, so a change there changes the site. Likewise the code in
# scripts/ingestion/*.mjs, which an admin route imports.
#
# The accepted exception: the content pipeline's own files (queue, staged output,
# run logs) ARE read by the admin pipeline and sourcer screens, via the
# filesystem. Those are local operator tools, so the cost is that the PRODUCTION
# copy of those screens shows data as of the last real deploy. Agreed with Keith
# 2026-10-04; do not add anything else the admin side reads without asking.

# Exact files and path prefixes (a trailing slash marks a directory).
SITE_IRRELEVANT=(
  "CHANGELOG.md"
  "CLAUDE.md"
  "scripts/analytics/reports/"
  "scripts/ingestion/run-log/"
  "scripts/ingestion/prospect-queue.json"
  "scripts/ingestion/output/"
  # The screens reference PDF (npm run screens), refreshed after each release.
  # Nothing in app/ or lib/ reads docs/ (grepped 2026-10-27).
  "docs/screens/"
)

is_site_irrelevant() {
  local file="$1" entry
  for entry in "${SITE_IRRELEVANT[@]}"; do
    case "$entry" in
      */) [[ "$file" == "$entry"* ]] && return 0 ;;
      *)  [[ "$file" == "$entry" ]] && return 0 ;;
    esac
  done
  return 1
}

# Succeeds only when every file changed between $1 and HEAD is on the allowlist.
# `--no-renames` lists both sides of a move, so renaming a site file INTO an
# allowed folder still counts the site file as changed. `-z` avoids git's
# quoting of unusual file names.
only_irrelevant_changes() {
  local base="$1" list file count=0
  list="$(mktemp)" || return 1
  if ! git diff --no-renames --name-only -z "$base" HEAD > "$list" 2>/dev/null; then
    rm -f "$list"
    return 1
  fi
  while IFS= read -r -d '' file; do
    count=$((count + 1))
    if ! is_site_irrelevant "$file"; then
      echo "Build needed: $file is not on the site-irrelevant list."
      rm -f "$list"
      return 1
    fi
  done < "$list"
  rm -f "$list"
  # An empty diff proves nothing (same commit redeployed, odd history): build.
  [ "$count" -gt 0 ] || { echo "Empty diff: building to be safe."; return 1; }
  return 0
}

if [ "$VERCEL_ENV" = "production" ]; then
  case "$VERCEL_GIT_COMMIT_MESSAGE" in
    *"[deploy]"*)
      echo "Production: the force-deploy tag is in the commit message — building."
      exit 1
      ;;
  esac

  # HEAD^ is the first parent: for a "Merge pull request" commit (the weekly
  # main → release promotion) that is the previous release, so the diff is the whole PR. Vercel clones with --depth=10,
  # and `git diff HEAD^ HEAD` is the pattern its docs use.
  if ! git rev-parse --verify --quiet HEAD^ > /dev/null; then
    echo "Production: no parent commit to compare with — building."
    exit 1
  fi
  only_irrelevant_changes HEAD^ || { echo "Production: building."; exit 1; }

  # If Vercel tells us the last deployed commit and it is reachable in the
  # shallow clone, hold the same line against it: a push of several commits at
  # once must not hide an earlier site change behind a final report-only one.
  if [ -n "${VERCEL_GIT_PREVIOUS_SHA:-}" ] \
     && git cat-file -e "${VERCEL_GIT_PREVIOUS_SHA}^{commit}" 2> /dev/null; then
    only_irrelevant_changes "$VERCEL_GIT_PREVIOUS_SHA" || { echo "Production: building."; exit 1; }
  fi

  echo "Production skipped: every changed file is on the site-irrelevant list (docs, logs, reports)."
  exit 0
fi

case "${VERCEL_GIT_COMMIT_REF:-}" in
  preview/*)
    echo "Branch ${VERCEL_GIT_COMMIT_REF} is a preview branch: building."
    exit 1
    ;;
esac

echo "Preview skipped: only preview/* branches build previews (see CLAUDE.md)."
exit 0
