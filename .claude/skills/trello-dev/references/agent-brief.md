# Sub-agent brief templates

Fill every `<...>`. Keep each brief self-contained: the agent has no memory of this
conversation, and what you leave out it will guess. Four roles, four templates.

## 1. Implementer (one lane)

Dispatch with `Agent({ subagent_type, model: "sonnet", isolation: "worktree", prompt })`.
For a lane with several cards, list them all under "The cards" in the order to build them.

```
You are implementing <one Trello card | N Trello cards, in order> for the Freedi monorepo,
alone, in your own git worktree.

## The card(s)
Trello card <shortLink>: <card title>
<card description, checklist items, and the relevant comments, verbatim or translated>
<repeat per card; each card becomes its own commit>

## What Tal agreed (decisions from the orchestrator's questions)
- <decision 1>
- <decision 2>

## IA spec (only for a new screen or flow; paste the information-architect's output)
<spec or "none">

## Scope
Apps touched: <agora | mass-consensus (MC) | functions | studio | main app | ...>
Likely files (from triage, verify before editing): <paths>
Branch: feat/<slug>   (create it from dev in your worktree: `git checkout -b feat/<slug>`)
Out of scope: <what NOT to touch>

## First: make the worktree runnable
You are in a fresh worktree under .claude/worktrees/ with no env files, no node_modules and no
built shared packages. Run once, from your worktree root:

    bash /Users/talyaron/Documents/Freedi-app/.claude/skills/trello-dev/scripts/prep-worktree.sh "$PWD" --apps=<agora,mc,functions,...>

Wait for it to finish (it runs npm install; a few minutes). If it fails, stop and report.
<For Agora cards add: then run `npm run preflight` in apps/agora BEFORE editing (memory rule).>

## House rules (from CLAUDE.md - a reviewer will check)
- No `any`. Types from `delib-npm` / `packages/shared-types` first.
- Components import only `*.module.scss`; design tokens, no hardcoded colors; BEM in SCSS.
- Errors: `logError(error, { operation, ... })` from `@/utils/errorHandling`, never bare console.error.
- Firebase refs via `@/utils/firebaseUtils`; timestamps in ms; constants from `@/constants/common`.
- New UI text goes through `useTranslation()` and gets keys in every language file of that app.
- Statement creation via `createStatementObject()` from shared-types.
- Files under 500 lines. Tests next to the code in `__tests__/`.
- Agora: the AI never writes or rewrites student text.

## Definition of done
1. Each card's behavior works as described above.
2. For EVERY app you touched, run in that app's directory and paste the tail of each result:
   - `npm run typecheck`
   - `npm run lint`
   - `npm test` (`cd functions && npm test` when functions changed; `npm run test:rules` at the repo root when firestore.rules changed)
   A failure that you believe is pre-existing must be shown red on the base commit too
   (check out dev in a throwaway `git worktree add /tmp/base-check dev`, never `git stash`).
3. One commit per card on feat/<slug> with a conventional message (feat/fix(<app>): ... (Trello <shortLink>)).
   Add only the files you changed. Do NOT push. Do NOT deploy.
   Do NOT touch /Users/talyaron/Documents/Freedi-app (the shared main tree).
4. Report, in this exact shape:
   - Worktree path, branch, commit sha(s) per card
   - What the user now sees (2-4 lines per card)
   - Files touched
   - Check results per app (typecheck / lint / tests: pass counts or the failure)
   - What needs deploying (rules / function names / hosting target) - or "nothing"
   - Anything you could not do or had to decide alone

If a card is unclear in a way that changes the build, do not guess silently: build the most
likely reading and list the assumption in the report.
```

## 2. Reviewer (M and L cards, after the implementer is green)

Dispatch with `Agent({ subagent_type: "qa-code-auditor", model: "sonnet", effort: "low", prompt })`.
No worktree isolation: it reads the implementer's worktree in place and edits nothing.
Give it the card and Tal's decisions, not your opinion of the diff.

```
Review one finished Trello card in the Freedi monorepo. Read only; change nothing.

Worktree: <absolute worktree path>   Branch: feat/<slug>   Base: dev
Diff to review: `git -C <worktree> diff dev...HEAD` (and `git log --oneline dev..HEAD`)

## The card
Trello card <shortLink>: <title>
<description / checklist / decisions Tal made>

## Answer these, briefly, with file:line evidence
1. Does the diff do what the card says? Name anything in the card that is not in the diff.
2. House-rule violations (CLAUDE.md): `any` types, hardcoded colors or spacing, global SCSS
   imports in components, bare console.error, Firebase refs built by hand, magic numbers,
   UI strings without i18n keys in every language file, files over 500 lines.
3. Behavior risks: an edge case, a race, a missing error path, a regression for another
   screen that imports the same code.
4. Tests: do the new tests exercise the card's behavior, or only mirror the implementation?

Verdict on the last line: APPROVE, or FIX with the numbered list of blocking items only.
Do not list style preferences. Do not run npm install or the app.
```

## 3. Conflict resolver (a branch that will not merge into dev)

Dispatch with `Agent({ subagent_type: "general-purpose", model: "sonnet", prompt })`.
It works inside the lane's existing worktree (pass the path; no new isolation).

```
A finished branch no longer merges cleanly into dev. Rebase it, keep both sides' intent,
and prove it is still green. Work only in this worktree.

Worktree: <absolute worktree path>   Branch: feat/<slug>
Conflicting files (from the failed merge): <paths>
The card this branch implements: <shortLink>: <title, two lines of what it changes>
What landed on dev since (other lanes of this batch): <one line per merged branch>

Steps:
1. `git -C <worktree> fetch` is not needed (local repo). Run `git rebase dev` on the branch.
2. Resolve each conflict so that BOTH the card's change and the change already on dev survive.
   When the two really exclude each other, keep dev's version and report it as an open question.
3. Re-run, in every app the branch touches: `npm run typecheck`, `npm run lint`, `npm test`.
   Paste the tails.
4. Do not push, deploy, stash, or touch /Users/talyaron/Documents/Freedi-app.
5. Report: resolved files with one line each on how, new HEAD sha, check results, open questions.
```

## 4. Rescue (second attempt after a failure)

Same template as the implementer, at `model: "opus"`, `effort: "high"`, with two extra
sections pasted in: **"What the first attempt did"** (its report and commit shas, so the
rescue agent can keep or revert them) and **"Why it failed"** (the red check output or the
reviewer's FIX list, verbatim). It works in the same worktree (pass the path, no new
isolation) so the first attempt's commits are there to build on or reset.

## Choosing type and model (summary)

- Bug with clear repro, small UI change, i18n, a function tweak → `sonnet`,
  `react-firebase-engineer` (UI) or `backend-security-engineer` (functions/rules).
- Styling-only → `sonnet`, `scss-architect`.
- New screen or flow → `information-architect` (opus) first for the IA spec, then a
  `sonnet` implementer with the spec pasted in, then the reviewer.
- Security, privacy, rules → `opus`, `backend-security-engineer` or `privacy-guardian`.
- Triage, "where is X", reading a thread → `haiku`, `Explore`, `effort: "low"`.
- Review → `sonnet`, `qa-code-auditor`, `effort: "low"`.
- Second attempt after a sonnet failure → `opus`, same type, `effort: "high"`, failure included.
