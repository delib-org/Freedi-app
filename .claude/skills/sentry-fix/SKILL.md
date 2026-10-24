---
name: sentry-fix
description: Sweep Sentry (sentry.io, org `freedi`) for open bugs across the Freedi apps and fix them with a team of sub-agents. The main session is the orchestrator - it pulls unresolved issues through the Sentry MCP tools, works out which app and file each one really comes from, sorts them into fix / noise / already-fixed / not-deployed, confirms the list with Tal, then runs the parallel-work skill (lanes of agents in worktrees, reviewer, one merge into local dev, worktree cleanup, deploy command list + one permission question), and finally resolves or comments on each Sentry issue. Use whenever Tal mentions Sentry, "errors in production", "check the bugs", "what's crashing", a Sentry issue id (FREEDI-APP-3E, MC-1P, WIZCOL-SIGN-4B) or a sentry.io link - even when he does not say "skill".
---

# Sentry-driven bug fixing

You are the **orchestrator**. You never fix an issue yourself. This skill owns only the
Sentry side: reading issues, attributing them to code, classifying them, and closing them
in Sentry. Everything between - triage, confirming understanding, lanes, dispatch,
verification, merge, worktree cleanup, the report and the deploy question - is the
**`parallel-work`** skill, followed exactly. Read
`/Users/talyaron/Documents/Freedi-app/.claude/skills/parallel-work/SKILL.md` when you reach
Step 4.

Sentry policy for the repo lives in `docs/SENTRY.md`. Read it at Step 2.

## Step 1 - Pull the open issues

Sentry is reached through the `mcp__sentry__*` tools (deferred: load
`search_issues`, `get_sentry_resource`, `search_errors`, `update_issue`,
`analyze_issue_with_seer` in **one** `ToolSearch` call).

- Org `freedi`, `regionUrl: https://de.sentry.io` (pass it on every call, or lookups miss).
- Projects: `freedi-app`, `mc`, `wizcol-mass-consensus`, `wizcol-sign`. There is no separate
  functions project; Cloud Functions report into `freedi-app` via `functions/src/utils/sentry.ts`.
  Re-run `find_projects` if a slug fails - Tal may have split projects since.

Default sweep, one `search_issues` per project, `limit: 25`, `sort: freq`:

```
is:unresolved environment:production
```

If Tal names an issue id or link, fetch just that with `get_sentry_resource`. If he says
"new" or "today", use `firstSeen:-24h` / `period: 24h`. Drop issues with `lastSeen` older
than 14 days unless Tal asks for the backlog - they are likely already fixed.

For each candidate, `get_sentry_resource` the issue to get: title, culprit, stack frames,
tags (`app`, `environment`, `release`, `url`, `browser`), event count, user count, first/last
seen. For a thin stack, `search_errors` for 2-3 recent events. Use
`analyze_issue_with_seer` only for an issue whose stack does not point at our code - it is
slow and its fix proposals are hints, not specs.

## Step 2 - Attribute each issue to an app and a file

The project an issue sits in is **not** reliable evidence of the app (one DSN served
main + sign + join until 2026-10-20). Decide the app in this order:

1. The `app` tag (`main`, `sign`, `mass-consensus`, `join`, `admin`, `agora`, `flow`,
   `odyssey`, `studio`, `chat`).
2. The `url` tag's host and route.
3. Chunk names in the stack: `vendor-firebase-*` = main; `assets/firebase-*` =
   join/admin/agora; `_next/static/**` = sign/MC.
4. A Cloud Function name in the transaction/culprit = `functions/`.

Then map the top in-app frame to a repo path (`apps/<app>/src/...`, `src/...` for main,
`functions/src/...`). Minified frames without source maps: search the repo for the error
message string or the function name in the culprit. Note the release sha if present - it
tells you whether the deployed code is older than `dev`.

## Step 3 - Classify

Every issue lands in exactly one bucket. Check the cheap buckets first.

| Bucket | How you know | What happens |
|---|---|---|
| **Not deployed** | The code on `dev` already handles it, or the failing callable/function does not exist in the deployed project (`firebase functions:list`, or an `internal`/`not-found` on a callable nobody deployed - this was FREEDI-APP-3E) | No code task. Goes on the deploy list in Step 6. |
| **Already fixed** | `git log -S'<message or symbol>' dev` shows a fix after `lastSeen`, and the release on the latest event predates it | No code task. Resolve in Step 6 if the fix is deployed, else deploy list. |
| **Noise** | Local/dev environment, browser extension frames, network aborts (`AbortError`, `Failed to fetch` with no app frame), client-fault `HttpsError` codes, bots | A filter task (see below), or `ignored` in Sentry if it is one-off. |
| **Bug** | Our code throws or mis-handles, reproducible from the stack | A fix task. |

Noise is fixed in the filters, never by swallowing errors at the call site:
browser apps in `packages/shared-utils/src/sentryFilters.ts` (+ `sentryOptions.ts`),
functions in `functions/src/utils/sentry.ts`, local-run guard in
`packages/shared-utils/src/isLocalRuntime.ts` (functions and chat keep their own copies -
keep all three in sync, see `docs/SENTRY.md`). An expected, user-caused condition that is
logged with `logError` should be downgraded to `console.info`, not deleted.

Ranking within **Bug**: users affected first, then events/day, then "is regressed / is
escalating". Default cap: the top **6** bugs per sweep unless Tal asks for more.

## Step 4 - Turn issues into tasks and run parallel-work

Each Bug or Noise issue is one `parallel-work` task:

- `id` = the Sentry short id (`FREEDI-APP-3E`)
- `title` = the issue title
- `spec` = app + file attribution, top stack frames (in-app only), tags that matter
  (browser, route, release), event/user counts, your bucket and the suspected cause in one
  line, and the acceptance check: **a unit test that reproduces the failure before the fix**
  wherever the code is testable (the `clean-code` skill applies to the fix)
- source = the Sentry issue link

Keep the short id in every commit message suffix (`(Sentry FREEDI-APP-3E)`).

Then follow `parallel-work` from Step 2 (triage) through Step 10 (deploy list and one
permission question). At its Step 3 (confirm understanding) show Tal **all four buckets**,
not just the fix tasks - the "not deployed" and "already fixed" rows are often the
biggest win. Group issues in the same file or the same filter into one lane.

## Step 5 - Deploy targets for Sentry fixes

Use parallel-work's deploy map, plus these Sentry-specific facts:

- A functions filter change takes effect **per function on redeploy** only. List the
  functions that actually emit the issue; don't redeploy all of them.
- MC and Sign ship via Vercel from `main-mc` / `main-sign` - a fix in `shared-utils`
  reaches them only after that merge + push.
- Shared packages change → rebuild them (`packages/shared-types`, `shared-utils`) and, for
  functions, repack the `.tgz` before deploying.

Never deploy or push without the one `AskUserQuestion` from parallel-work Step 10.

## Step 6 - Close the issues in Sentry

After the merge (and again after any approved deploy):

| State | Sentry action (`update_issue`) |
|---|---|
| Fix merged **and deployed** | `status: resolved`, `reason`: `Fixed in <sha> (<branch>), deployed <date> to <targets>` |
| Fix merged, **not deployed** | `status: resolvedInNextRelease` only if the app's events carry a `release` tag; otherwise leave it unresolved and list it in the report as "resolve after deploy" |
| Already fixed and deployed | `status: resolved`, `reason`: `Already fixed in <sha>` |
| Noise, filtered | `status: resolved` once the filter is deployed; one-off noise → `status: ignored`, `ignoreMode: untilEscalating`, with a `reason` |
| Could not reproduce / needs Tal | leave unresolved; say why in the report |

A resolved issue that comes back will show as **regressed** - that is the check that the
fix held. Never resolve an issue whose fix is not live.

## Step 7 - Report and remember

The report (parallel-work Step 9) has one row per Sentry issue:
`short id | app | bucket | cause (one line) | commit | Sentry status | deploy needed`.

Write one memory note `sentry-batch-<date>.md` (see `sentry-batch-2026-10-20` for the
shape): which issues were fixed, what was deployed, what is owed to Tal, and any
non-obvious cause worth knowing next sweep.

## Etiquette

- The project an issue is filed under is a hint, not the answer - attribute by tag/URL/chunk.
- Check "not deployed" and "already fixed" before writing any code.
- Fix noise in the shared filter, not by deleting `logError` calls.
- Every bug fix comes with a test that fails without it, when the code is testable.
- Resolve in Sentry only what is live; everything else is "resolve after deploy" in the report.
