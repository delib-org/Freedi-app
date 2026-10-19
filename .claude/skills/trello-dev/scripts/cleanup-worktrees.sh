#!/usr/bin/env bash
# Remove side worktrees whose work is already in dev. Branches are never deleted.
#
# Usage:  cleanup-worktrees.sh            # dry run: lists what would go and what stays, and why
#         cleanup-worktrees.sh --yes      # actually remove the safe ones
#         cleanup-worktrees.sh --yes --base=main --age=120
#
# Safe = HEAD is an ancestor of the base branch AND no uncommitted or untracked changes
#        AND the worktree has at least one commit of its own (HEAD != base tip: a worktree
#        sitting exactly on the base tip is a fresh one some agent is about to use)
#        AND it was not touched in the last --age minutes (default 60).
# Everything else (unmerged, dirty, fresh, busy, or the main tree itself) is listed and kept.

set -uo pipefail

ROOT="/Users/talyaron/Documents/Freedi-app"
BASE="dev"
YES=0
AGE=60
for arg in "$@"; do case "$arg" in --yes) YES=1 ;; --base=*) BASE="${arg#--base=}" ;; --age=*) AGE="${arg#--age=}" ;; esac; done
BASE_TIP="$(git -C "$ROOT" rev-parse --short "$BASE")"
NOW="$(date +%s)"

git -C "$ROOT" worktree prune

removed=0; kept=0
while IFS= read -r wt; do
  [[ "$(cd "$wt" 2>/dev/null && pwd -P)" == "$(cd "$ROOT" && pwd -P)" ]] && continue
  if [[ ! -d "$wt" ]]; then echo "GONE   $wt (pruned)"; continue; fi
  br="$(git -C "$wt" branch --show-current 2>/dev/null)"; br="${br:-detached}"
  sha="$(git -C "$wt" rev-parse --short HEAD 2>/dev/null)"
  dirty="$(git -C "$wt" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  if ! git -C "$ROOT" merge-base --is-ancestor "$sha" "$BASE" 2>/dev/null; then
    echo "KEEP   $br @ $sha  not in $BASE  $wt"; kept=$((kept+1)); continue
  fi
  if [[ "$dirty" != "0" ]]; then
    echo "KEEP   $br @ $sha  $dirty uncommitted file(s)  $wt"; kept=$((kept+1)); continue
  fi
  if [[ "$sha" == "$BASE_TIP" ]]; then
    echo "KEEP   $br @ $sha  fresh (no commits of its own; an agent may be about to use it)  $wt"; kept=$((kept+1)); continue
  fi
  mtime="$(stat -f %m "$wt/.git" 2>/dev/null || echo 0)"
  if (( NOW - mtime < AGE * 60 )); then
    echo "KEEP   $br @ $sha  touched $(( (NOW - mtime) / 60 )) min ago (< $AGE)  $wt"; kept=$((kept+1)); continue
  fi
  if [[ $YES -eq 1 ]]; then
    if git -C "$ROOT" worktree remove "$wt" 2>/dev/null; then echo "REMOVED $br @ $sha  $wt"; removed=$((removed+1))
    else echo "FAILED  $br @ $sha  $wt (try: git worktree remove --force)"; kept=$((kept+1)); fi
  else
    echo "WOULD REMOVE  $br @ $sha  (in $BASE, clean)  $wt"
  fi
done < <(git -C "$ROOT" worktree list --porcelain | awk '/^worktree /{print $2}')

git -C "$ROOT" worktree prune
if [[ $YES -eq 1 ]]; then echo "==> removed $removed, kept $kept. Branches untouched; see 'git branch --merged $BASE' to prune those separately."
else echo "==> dry run. Re-run with --yes to remove the safe ones."; fi
