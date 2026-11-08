---
name: parallel-work
description: Develop several tasks at once with a team of sub-agents, one git worktree per lane. The main session is the orchestrator - it takes tasks from Tal's message, a plan/spec file or pending memory items, triages them with a cheap agent, confirms understanding with Tal, groups them into lanes (one worktree + one agent pipeline per lane, several in parallel), verifies with a reviewer agent, merges every green branch into local dev at the end, removes the worktrees it created, then hands Tal the exact deploy commands and asks once before running any of them. Use when Tal says "work in parallel", "parallel features", "spin up worktrees", "do these N tasks together", "several agents", "run the plan", or hands over a plan file to execute. It is also the engine behind /trello-dev. Never start it on your own initiative.
---

# Parallel work

You are the **orchestrator**. You never implement a task yourself. You collect the tasks,
agree with Tal on what each one means, hand the work to sub-agents in isolated worktrees,
check their evidence, merge everything into local `dev` at the end, remove the worktrees,
and ask once about deploying. Your own context is the scarce resource: anything over a
handful of tool calls is delegated, and every agent gets the cheapest model that can do
its job.

Brief templates and the deploy map live in `references/`; helper scripts in `scripts/`.
Read a reference when you reach the step that needs it, not before.

## The team (models, agents, effort)

| Role | When | Model / agent | Effort |
|---|---|---|---|
| **Triage** | once per batch: apps, files, size, overlaps per task | `haiku` / `Explore` | low |
| **IA spec** | any new screen, flow, or "looks confusing" task | `opus` / `information-architect` | default |
| **Implementer** | the task itself | `sonnet` / `react-firebase-engineer` (UI), `backend-security-engineer` (functions, rules), `scss-architect` (styling only), `general-purpose` (mixed) | default |
| **Reviewer** | every M/L task after the implementer reports green | `sonnet` / `qa-code-auditor` | low |
| **Conflict resolver** | a branch that will not merge cleanly into dev | `sonnet` / `general-purpose` | default |
| **Rescue** | second attempt after a sonnet failure; tricky debugging; security, privacy, rules | `opus` / same type (or `system-architect`, `privacy-guardian`) | high |

Rules that keep this cheap:

- Start at the cheapest tier that fits; escalate only on evidence of failure. Say which
  model and agent you chose when you dispatch so Tal can override.
- Every custom agent file declares `model: fable`. Pass `model:` explicitly on every
  `Agent` call, or triage runs on the top tier.
- Never use `subagent_type: "fork"` here. Briefs are self-contained; a fork drags your whole
  context into every agent.
- Continue an existing agent with `SendMessage` for a fix (same context, cheap). Start a
  fresh agent only when you change model or the agent's context is poisoned by a wrong path.
- Read agents' **reports**, not their diffs. The reviewer reads diffs; you read verdicts.
- Agents run in the background. Wait for the task notification; do not poll, do not do the
  agent's work while it runs. Compact your own context between phases when it grows.
- Three to five lanes at a time. Each lane runs its own `npm install`; more than five
  thrashes the machine and the merge step.
- If Tal says "use a workflow" or "ultracode", the same lanes may run through the `Workflow`
  tool; otherwise this skill uses the `Agent` tool only.

## Step 1 - Collect the tasks

A **task** is `id` (short slug you assign: `t1`, `t2`, ...), `title`, `spec` (text or a
file path plus section), and `apps` when known. Three sources; use whichever Tal gave:

- **A list in his message.** Each bullet or sentence is one task. Keep his words as the spec.
- **A plan or spec file** (`~/.claude/plans/*.md`, `docs/**`, `plans/**`). Read it once.
  Split it along its own headings or phases into tasks that can run independently. A phase
  that needs another phase's output is not a separate task: both go into one lane, in order.
  If the file is long, hand the splitting to the triage agent and read only its table.
- **Pending items in memory notes.** Only when Tal names the notes or says "the pending
  ones" / "what is owed". Read those notes and turn each "NOT started / pending / owed /
  NOT deployed" item into a task, with the note name as the source.

Never start from nothing. If no source is given, ask which tasks to run. Never spin up
worktrees because a job merely *looks* parallel; this skill runs when Tal asks for it.

## Step 2 - Triage with one cheap agent

Dispatch **one** `haiku` `Explore` agent (`effort: "low"`) with every task pasted in. It
answers, per task, in a table you can forward to Tal:

- app(s) and the two to five files most likely to change
- size: **S** (one file, clear repro), **M** (a feature inside existing screens), **L** (new
  screen, new flow, new data shape, cross-app)
- which other tasks in the batch touch the same files
- whether an IA spec is needed (new screen/flow, or the task says "confusing"/"looks bad")

You never grep the repo for this yourself. The triage table is the input to Steps 3 and 4.

## Step 3 - Confirm understanding before any work (Tal's rule)

For each task you intend to take, restate it in plain English in two or three sentences,
in terms of what the user sees on screen, and ask the one to three questions whose answer
changes the build. Batch all tasks into one message (or one `AskUserQuestion` with one
question per task). Wait for the answers. Only then dispatch.

Skip the questions only when Tal has said "just go" / "no questions" for this batch, or the
task is unambiguous (a reported bug with a clear repro). Say that you are skipping and why.

## Step 4 - Group tasks into lanes

A **lane** is one git worktree, one branch, one agent pipeline. Lanes run in parallel;
tasks inside a lane run one after another.

- Tasks that share no files → **one lane each**. This is the normal case and is why the
  worktrees exist: no half-staged files bleed between tasks, and the branches merge cleanly.
- Tasks that touch the same files (triage says so), or depend on each other → **one lane,
  one agent, tasks in sequence**, one commit per task. Two agents editing the same file in
  two worktrees only produces a conflict you then pay a third agent to resolve.
- **L tasks** get a pipeline inside their lane: IA agent first (its spec is pasted into the
  implementer's brief), then the implementer, then the reviewer. **M tasks**: implementer
  then reviewer. **S tasks**: implementer only; you verify the evidence yourself.
- A single S task with nothing else in flight still gets its own worktree. The main tree is
  shared with live sessions and is never an implementation target.

Branch per lane: `feat/<slug>` (or `fix/<slug>`), created from `dev`. For a multi-task lane
the branch name is the lane's theme and each task is its own commit.

## Step 5 - Dispatch the lanes

Per lane: dispatch the lane's first agent with `isolation: "worktree"` (the Agent tool
creates the worktree under `.claude/worktrees/agent-*`). The brief is the implementer
template in `references/agent-brief.md` with the blanks filled. It tells the agent to run
`scripts/prep-worktree.sh` first: a bare worktree has no env files, no `.firebaserc`, no
`node_modules` and no built shared packages, and `typecheck` fails on files it never
touched without them. For an L lane the first agent is the IA agent (no worktree needed;
it only writes `docs/ia/<app>-<feature>.md` content into its report).

Send all lanes' dispatches for the batch **in one message** so they run concurrently.

Emulators and dev servers can run from only one tree at a time on the default ports; an agent
that must run the app uses the solo or alt port suite (CLAUDE.md).

## Step 6 - Verify each lane

An agent's confidence is not evidence. When an implementer reports, check in its worktree:

```bash
git -C <worktree> log --oneline dev..HEAD      # commits exist, one per task
git -C <worktree> status --short               # nothing left uncommitted
```

and read the typecheck, lint and test tails it pasted, for **every app it touched**
(`functions`' `npm test` when it touched functions; `npm run test:rules` when it touched
Firestore rules). A missing or red result → `SendMessage` the same agent once with the gap.
A second failure → one `opus` rescue agent with a fresh brief that includes the failure
output. A third failure → report to Tal; the lane stays open. Do not fix it yourself
unless it is a one-line change.

For M and L tasks, then dispatch the **reviewer** (`sonnet` `qa-code-auditor`, low effort,
reviewer template in the brief). Give it the task, Tal's decisions and the worktree path,
never your own conclusions. It returns: does the diff do what the task says, house-rule
violations (`any`, hardcoded colors, bare `console.error`, missing i18n keys), and a verdict.
Findings go back to the implementer via `SendMessage`; the reviewer runs once more only if
the fix was non-trivial.

Flaky or pre-existing failures: the agent must prove "pre-existing" by showing the same test
red on the base commit (in a throwaway worktree, never `git stash` in the shared main tree).
A pre-existing failure is reported to Tal as its own item, not a reason to skip.

## Step 7 - Merge everything into dev

Merging happens **once, at the end of the batch**, after every lane is verified, so one
late lane never blocks the others and the merge order is yours. From the main tree:

```bash
bash .claude/skills/parallel-work/scripts/finish-batch.sh feat/<slug-1> feat/<slug-2> ...
```

The script refuses to run unless the main tree is on `dev` with no foreign uncommitted
changes to the files those branches touch, merges each branch `--no-ff` in the order given
(put lanes that touch the same app last, so conflicts surface where they are cheapest), and
**stops at the first conflict** after aborting that merge. On a conflict, dispatch a
**conflict resolver** (`sonnet`, resolver template in the brief) into that lane's worktree:
it rebases the branch onto current `dev`, re-runs the app's checks, and reports. Then re-run
the script with the remaining branches. A conflict on the shared-types `.tgz` in
`functions/` is repacked, never picked by side (the resolver template says how).

After the last merge, when two lanes touched the same app, run that app's `npm run
typecheck` once in the main tree: two green branches can still disagree. If it is red, a
sonnet agent in a fresh worktree off `dev` fixes it as its own `fix/` commit; do not edit
`dev` directly.

Never `git stash`, never switch the main tree's branch, never push. Deploys happen only
in Step 10, after Tal says yes to the listed commands. If the main tree is on another
branch or carries someone else's edits to the same files, say so and merge inside one
lane's worktree instead (`git checkout dev` there is fine; it is the agent's tree), or ask Tal.

## Step 8 - Remove the worktrees (Tal: this is important)

```bash
bash .claude/skills/parallel-work/scripts/cleanup-worktrees.sh          # lists what is safe to remove
bash .claude/skills/parallel-work/scripts/cleanup-worktrees.sh --yes    # removes merged, clean worktrees
```

It removes only worktrees whose HEAD is already in `dev`, that have no uncommitted
changes, that are not sitting at the `dev` tip (a fresh tree is another session's agent
about to start) and that were not touched in the last 60 minutes; branches are kept.
Worktrees of lanes still open stay. Always run the dry run first and tell Tal what was
removed and what was left and why. A worktree that is not yours (unknown branch, dirty) is
another session's work: leave it and mention it.

## Step 9 - Report to Tal

One table for the batch: task, lane/branch, model(s) used, checks, review, merged into
dev?, deploy needed, notes. Plain short English, no jargon - describe what changed on
screen. Then the deploy list from Step 10.

When the batch is done, save a `project` memory note for anything not derivable from git:
decisions Tal made in Step 3, deploy order, lanes left open, what was deployed.

## Step 10 - Deployment: list the commands, then ask

Nothing in this skill deploys on its own. The batch ends with two things:

1. **The command list.** From the merged branches' `git diff --name-only dev~N..dev`, map
   every touched area to its target and exact command with `references/deploy-map.md`.
   Functions are listed **by name** (the exported functions whose code path changed), in
   batches of 10-20; the order is rules → functions → hosting; MC and Sign are a merge into
   `main-mc` / `main-sign` plus a push. Print it as a block Tal can paste:

   ```
   npm run deploy:rules:prod
   npm run deploy:f:prod -- createLesson gradeAnswer
   npm run deploy:agora
   ```

   plus one line per command saying what it ships ("agora: the new lesson builder"). If
   nothing needs deploying, say "nothing to deploy" explicitly.

2. **The permission question.** Everything in that list is something this session can run
   itself from the main tree, so ask once, with `AskUserQuestion`: deploy all of it now,
   deploy a subset (functions only / hosting only / to `test` first), or not now. Never run
   a deploy on an earlier "yes" from another batch or another day; approval in one context
   does not carry to the next.

On a yes: check `git status` first and deploy from a clean tree (a dirty main tree with
someone else's edits means deploy from a fresh worktree on `dev`). Run the commands in the
listed order, one at a time, and watch each result. A 429 on functions means the batch was
too big; retry the names that failed in smaller batches. After the last command, confirm
the main tree is back on the dev env (`npm run env:dev` if a script was interrupted) and
record the deploy in the memory note. Pushing `dev` or `main` to origin is a separate ask;
it is not implied by a deploy.

On a no or a subset: leave the rest of the list in the report, unchanged, so Tal can run it
later. Do not nag.

## Worktrees-only variant

If Tal only wants the environments (no agents), create one per feature from the main tree:

```bash
git worktree add /Users/talyaron/Documents/Freedi-app.worktrees/<name> -b feat/<name> dev
bash .claude/skills/parallel-work/scripts/prep-worktree.sh /Users/talyaron/Documents/Freedi-app.worktrees/<name> --apps=<...>
```

Hand back the paths with a `cd <path> && npm run dev -- --port <free port>` hint and stop.
He drives each one himself or opens a separate Claude session per worktree. Removal is
the same `cleanup-worktrees.sh` once the branch is merged.

## Etiquette

- Cheap first, escalate on evidence. Say the model you used.
- The main tree is shared by live sessions: never stash, never switch its branch, never
  reset it. Unexplained modified files there are someone else's work.
- One agent per lane at a time; the reviewer starts only after the implementer is green.
- Worktrees you created are removed at the end of the batch, every time.
- Deploys: list the exact commands, ask once, run only what Tal approved, in order. The
  same scripts every time (`references/deploy-map.md`), never raw `firebase deploy`.
- Tal's standing rules in memory apply: commit finished work, deploy only on ask, talk in
  simple English, paragraphs/types/firebase/error conventions from `CLAUDE.md`.
