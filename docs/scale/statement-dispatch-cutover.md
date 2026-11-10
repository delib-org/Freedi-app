# Statement dispatcher cutover runbook

Moves 13 statement handlers from their own triggers onto `onStatementWriteDispatch`, so that one statement update starts 6 functions instead of 18. Do every step on `freedi-test` first, then on production.

## How it works

Each write belongs to one side, according to its commit time compared with T (`STATEMENT_DISPATCH_CUTOVER_MS`). Writes before T stay with the old triggers. Writes at or after T go to the dispatcher.

Each function keeps the value it was given at deploy. **All 14 must hold the same T before T arrives.** If they don't:

| Function holding a wrong or missing value | Result from T onward |
|---|---|
| The dispatcher | The old triggers stand down and nothing replaces them: **all 13 handlers are missed** |
| One old trigger | That handler runs twice (`fn_autoAddParagraph` adds a second paragraph) |

The 14 functions are listed in `scripts/scale/dispatchCutover.config.json`. A unit test keeps that list equal to the dispatcher's routes.

```
LIST=onStatementWriteDispatch,queueDeliberation,fn_syncOptionMembersToSheet,fn_backupOptionMembership,onStatementCreatedMarkCondensationStale,fn_syncParagraphChildrenToDescription,fn_pruneVersionHistory,fn_autoRemoveParagraph,fn_autoAddParagraph,fn_createReplacementQueueItem,fn_updateQueueConsensus,updateOptionInMassConsensus,mirrorQuestionStatusToSurvey,onVoteUpdate
```

The checks only read. They have not been run against a real project yet, so the `gcloud` field names they rely on (`state`, `updateTime`, `serviceConfig.environmentVariables`, `eventTrigger.trigger`, Eventarc `conditions`) get their first real test in step 3 on `freedi-test`.

## Steps

Run these from the repository root. `<target>` is `test` or `prod`. `<project-id>` is the real project id. Production is `wizcol-app`, not the `.firebaserc` alias named `prod`.

1. **Choose T**, in milliseconds, at least 90 minutes ahead (`date` plus the lead, times 1000). Avoid a live session with many participants. Set `STATEMENT_DISPATCH_CUTOVER_MS=T` in `env/.env.<target>`.

2. **Preflight, then deploy.** The preflight refuses a T that is too soon, implausible, or a list that is not exactly the 14:

   ```
   npx tsx scripts/scale/dispatchCutover.ts preflight --target=<target> --names=$LIST
   npm run deploy:f:<target> -- $LIST
   ```

   Deploy the 14 as one command, with no other functions in that command. If it reports any failure, go to "If a deploy fails".

3. **Verify, before T.** Wait until the deploy has finished, then run:

   ```
   npx tsx scripts/scale/dispatchCutover.ts verify --target=<target> --project=<project-id>
   ```

   It refuses unless all of these hold:
   - all 14 are `ACTIVE` and hold exactly T
   - each function's last revision is at least 15 minutes before T
   - the dispatcher's new Eventarc trigger has no failing condition and last changed at least 15 minutes before T

   Do not continue on a refusal.

4. **Let T pass.** Nothing to do at T itself.

5. **Check on `freedi-test` (canary).** Make these real writes after T, then check each result:
   - Rate an answer. The dispatcher ran, and the rating counted once.
   - Join and leave an answer. One backup row each.
   - Edit a paragraph. The parent's description updates.
   - On a document with consensus actions on, take a suggestion over the addition threshold. **Exactly one** new paragraph.
   - Delete an answer. The dispatcher ran.

   This is where the assumption that every trigger sees the same commit time gets confirmed. Do not start production until it passes.

6. **Repeat steps 1 to 4 on production**, then repeat the checks in step 5 that are safe on real data (rate, join, paragraph edit).

7. **Watch for 24 hours.** Look for 429s and `statementDispatch.` errors in the logs. Redelivered events from before T still need the old triggers, and Eventarc's default retention is 24 hours.

8. **Do not unset or change the variable** at any point until step 9. Deploying any of the 14 with a different value breaks the rule above.

9. **Remove, as one release, in this order.** This must happen together: after the old triggers are gone, an unset or malformed variable would silently stop all 13 handlers, so the check has to leave with them.

   a. One commit that:
      - removes the cutover check from `dispatchStatementWrite`, so the dispatcher always owns events
      - deletes `statementDispatch/cutover.ts`, `legacyTriggers.ts` and their test
      - removes the 13 exports from `index.ts`, including the `skipWhenDispatcherOwns` wrapper on `updateOptionInMassConsensus`
      - removes the mapping from `env/env-loader.js`

   b. Deploy only the dispatcher: `npm run deploy:f:<target> -- onStatementWriteDispatch`. The old triggers still hold T and keep standing down, so nothing runs twice.

   c. Confirm the new revision is active, then delete the old triggers straight away:

      ```
      firebase functions:delete queueDeliberation fn_syncOptionMembersToSheet fn_backupOptionMembership onStatementCreatedMarkCondensationStale fn_syncParagraphChildrenToDescription fn_pruneVersionHistory fn_autoRemoveParagraph fn_autoAddParagraph fn_createReplacementQueueItem fn_updateQueueConsensus updateOptionInMassConsensus mirrorQuestionStatusToSurvey onVoteUpdate --region me-west1 --project <project-id>
      ```

   d. Remove the variable from `env/.env.<target>`.

## If a deploy fails

| When | What to do |
|---|---|
| Before T, and a full redeploy can finish before T | Choose a **later** T, set it, and redeploy **all 14**. Then run verify. Never redeploy only the ones that failed: every function needs the same value. |
| Before T, and there is not enough time | Finish redeploying all 14 at the current T, then verify. Do not change T: if old triggers keep the earlier T while the dispatcher holds a later one, writes between the two are missed. |
| After T, the dispatcher lacks T | Urgent: all 13 handlers are being missed. Deploy the dispatcher with T now, then list the writes since T and repair them. |
| After T, an old trigger lacks T | That handler is running twice. Deploy that trigger with T now, then check for duplicates (paragraphs, sheet rows, queue items). |

## Rollback

| When | What to do | Exact? |
|---|---|---|
| Before T | Remove the value and redeploy all 14 before T. | Yes |
| After T, before step 9 | Remove the value and redeploy all 14. | No: during the redeploy a write can run twice or not at all. Review that window afterwards. |
| After step 9 | Revert the removal commit and redeploy the old triggers. | No: the same window, and the old triggers need recreating. |

## What happens if the variable is wrong

- **Unset:** the dispatcher does nothing and the old triggers handle everything. Each deployed cold start logs one warning.
- **Malformed or below 2026-01-01 in ms (for example, a value in seconds):** treated as unset, with one error logged per cold start.
