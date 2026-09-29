#!/usr/bin/env bash
# Vercel "Ignored Build Step" (wired up in vercel.json → ignoreCommand).
# Vercel's convention: exit 0 = SKIP this build, exit 1 = BUILD it.
#
# Previews are opt-in. Every push to a branch used to build a preview, and
# with most work arriving as Claude branches that was a deployment per push —
# each one adding to Functions Storage and drawing Fluid Active CPU when
# anything (a sweep, a crawler, a Vercel check) touched it. Stromata went over
# the Hobby CPU allowance in Sept 2026; see CHANGELOG.md 2026-09-29.
#
#   • Production (merges to main) always builds.
#   • A preview builds only when the pushed head commit's message contains
#     [preview] — the explicit "yes, I want to look at this" signal.

if [ "$VERCEL_ENV" = "production" ]; then
  echo "Production deployment: building."
  exit 1
fi

case "$VERCEL_GIT_COMMIT_MESSAGE" in
  *"[preview]"*)
    echo "Commit asks for a preview ([preview] in message): building."
    exit 1
    ;;
esac

echo "Preview skipped: no [preview] in the head commit message (previews are opt-in — see CLAUDE.md)."
exit 0
