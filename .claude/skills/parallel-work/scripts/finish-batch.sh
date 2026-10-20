#!/usr/bin/env bash
# Merge a batch of finished lane branches into local dev, in the shared main tree, safely.
#
# Usage:  finish-batch.sh <branch> [<branch> ...]
#
# - Refuses unless the main tree is on dev.
# - Refuses if the main tree has uncommitted changes to any file one of the branches touches
#   (someone else's live work); other dirty files are listed but tolerated.
# - Merges each branch with --no-ff, in the order given.
# - On the first conflict: aborts that merge, prints the conflicting files, exits 2.
#   Dispatch a conflict-resolver agent into that lane's worktree, then re-run with the rest.
# - Never pushes, never stashes, never switches branch.

set -uo pipefail

ROOT="/Users/talyaron/Documents/Freedi-app"
TARGET="dev"
TODAY="$(date +%Y-%m-%d)"

[[ $# -ge 1 ]] || { echo "usage: finish-batch.sh <branch> [<branch> ...]" >&2; exit 1; }

cur="$(git -C "$ROOT" branch --show-current)"
if [[ "$cur" != "$TARGET" ]]; then
  echo "ERROR: main tree is on '$cur', not '$TARGET'. Never switch it; merge inside a lane worktree instead or ask Tal." >&2
  exit 1
fi
if [[ -d "$ROOT/.git/rebase-merge" || -d "$ROOT/.git/rebase-apply" || -f "$ROOT/.git/MERGE_HEAD" ]]; then
  echo "ERROR: main tree has a merge or rebase in progress." >&2
  exit 1
fi

for br in "$@"; do
  git -C "$ROOT" rev-parse --verify -q "refs/heads/$br" >/dev/null || { echo "ERROR: no local branch '$br'" >&2; exit 1; }
done

dirty="$(git -C "$ROOT" status --porcelain --untracked-files=no | awk '{print $2}')"
if [[ -n "$dirty" ]]; then
  echo "==> Main tree has uncommitted changes (someone else's work?):"
  printf '    %s\n' $dirty
  for br in "$@"; do
    touched="$(git -C "$ROOT" diff --name-only "$TARGET...$br")"
    clash="$(comm -12 <(printf '%s\n' $dirty | sort) <(printf '%s\n' $touched | sort))"
    if [[ -n "$clash" ]]; then
      echo "ERROR: '$br' touches files that are dirty in the main tree:" >&2
      printf '    %s\n' $clash >&2
      echo "Leave them alone; merge this batch inside a lane worktree, or ask Tal." >&2
      exit 1
    fi
  done
  echo "    (none of them overlap the branches; continuing)"
fi

merged=()
for br in "$@"; do
  if git -C "$ROOT" merge-base --is-ancestor "$br" "$TARGET"; then
    echo "==> $br already in $TARGET, skipping"; merged+=("$br (already)"); continue
  fi
  subject="$(git -C "$ROOT" log -1 --format=%s "$br")"
  echo "==> Merging $br  ($subject)"
  if git -C "$ROOT" merge --no-ff --no-edit "$br" -m "Merge $br into $TARGET: $subject" >/dev/null 2>&1; then
    merged+=("$br $(git -C "$ROOT" rev-parse --short HEAD)")
  else
    files="$(git -C "$ROOT" diff --name-only --diff-filter=U)"
    git -C "$ROOT" merge --abort
    echo "CONFLICT merging $br. Merge aborted; $TARGET is unchanged for this branch." >&2
    echo "Conflicting files:" >&2
    printf '    %s\n' $files >&2
    echo "Merged so far: ${merged[*]:-none}" >&2
    echo "Next: dispatch a conflict-resolver agent into the worktree of $br, then re-run with the remaining branches." >&2
    exit 2
  fi
done

echo "==> Merged into $TARGET ($TODAY): ${merged[*]}"
echo "==> Apps touched by this batch (run their typecheck once in the main tree if two lanes share one):"
for br in "$@"; do git -C "$ROOT" diff --name-only "$TARGET~0" "$br" 2>/dev/null; done \
  | awk -F/ '$1=="apps"{print $2; next} $1=="functions"{print "functions"; next} $1=="packages"{print "packages/"$2; next} {print "main"}' \
  | sort | uniq -c | sort -rn | sed 's/^/    /'
echo "==> dev HEAD: $(git -C "$ROOT" rev-parse --short HEAD). NOT pushed. NOT deployed."
