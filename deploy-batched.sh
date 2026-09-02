#!/usr/bin/env bash
#
# Batched Cloud Functions deploy.
#
# Two reasons this exists rather than a plain `npm run deploy:f:prod`:
#
#  1. SAFETY. Seven functions are live in prod from feat/agora-control-panels
#     (agoraTeacherConsole, agoraTeacherRoster, agoraAdminManageSchool,
#     agoraAdminOpenClass, agoraJoinClass, agoraUpdateStagePlan,
#     onAgoraSessionFinished) and are NOT in main, because that branch was
#     deliberately left out of the merge. An unfiltered deploy sees them as
#     removed and will abort, or delete them if told to. A deploy scoped with
#     --only functions:<name> can never touch anything outside its filter.
#
#  2. QUOTA. 221 functions at the Cloud Run 1 vCPU default is ~221,000 mCPU,
#     and old and new revisions overlap during a rollout. The me-west1 ceiling
#     is now 400,000 (raised from 200,000), so small batches keep the overlap
#     well clear of it.
#
# Written for bash 3.2, which is what macOS ships — no mapfile, no negative
# array subscripts.
#
# Usage:
#   ./deploy-batched.sh            # deploy all, 25 at a time
#   ./deploy-batched.sh 10         # smaller batches
#   ./deploy-batched.sh 25 5       # batch size 25, resume from batch 5
#
set -u

BATCH_SIZE="${1:-25}"
START_AT="${2:-1}"
HERE="$(cd "$(dirname "$0")" && pwd)"
LIST="$HERE/deploy-functions-list.txt"
PAUSE=20

[ -f "$LIST" ] || { echo "missing $LIST"; exit 1; }

FNS=()
while IFS= read -r line || [ -n "$line" ]; do
  [ -n "$line" ] && FNS[${#FNS[@]}]="$line"
done < "$LIST"

TOTAL=${#FNS[@]}
[ "$TOTAL" -gt 0 ] || { echo "no function names in $LIST"; exit 1; }
BATCHES=$(( (TOTAL + BATCH_SIZE - 1) / BATCH_SIZE ))

echo "=============================================="
echo " $TOTAL functions, $BATCH_SIZE per batch, $BATCHES batches"
echo " starting at batch $START_AT"
echo "=============================================="

b=1
while [ "$b" -le "$BATCHES" ]; do
  if [ "$b" -lt "$START_AT" ]; then b=$((b+1)); continue; fi

  offset=$(( (b - 1) * BATCH_SIZE ))
  slice=( "${FNS[@]:offset:BATCH_SIZE}" )
  count=${#slice[@]}
  last_index=$(( count - 1 ))
  names=$(IFS=,; echo "${slice[*]}")

  echo
  echo "----------------------------------------------"
  echo " BATCH $b / $BATCHES  ($count functions)"
  echo " ${slice[0]} ... ${slice[$last_index]}"
  echo "----------------------------------------------"

  # --force is required for batches containing a function with minInstances > 0
  # (serveJoinShareRoutes, batch 8) — the CLI otherwise refuses non-interactively
  # because that raises the minimum bill. It stays safe because the deploy is
  # scoped by --only functions:<name> and cannot touch anything outside it.
  npm run deploy:f:prod -- "$names" --force 2>&1 | tee "$HERE/deploy-batch-$b.log"
  status=${PIPESTATUS[0]}

  if [ "$status" -eq 0 ]; then
    echo "batch $b OK"
  else
    echo
    echo "=============================================="
    echo " BATCH $b FAILED (exit $status)."
    echo " Nothing outside this batch was touched."
    echo " Full output: deploy-batch-$b.log"
    echo " The real error is the first line matching 'Error' in that file:"
    echo "   grep -n -m5 -iE 'error|quota|denied' deploy-batch-$b.log"
    echo " Fix, then resume with:"
    echo "   ./deploy-batched.sh $BATCH_SIZE $b"
    echo "=============================================="
    exit 1
  fi

  if [ "$b" -lt "$BATCHES" ]; then
    echo "settling for ${PAUSE}s before the next batch..."
    sleep "$PAUSE"
  fi
  b=$((b+1))
done

echo
echo "=============================================="
echo " All $BATCHES batches deployed."
echo " The 7 agora control-panel functions were left untouched, as intended."
echo "=============================================="
