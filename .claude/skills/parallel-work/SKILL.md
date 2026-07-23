---
name: parallel-work
description: Set up and drive parallel feature development across isolated git worktrees. Use when Tal wants to work on several features at once ("work in parallel", "parallel features", "spin up worktrees", "start N features together"). Creates a fully-configured worktree per feature and optionally dispatches a background agent into each to implement it.
---

# Parallel Work

Sets up **one isolated git worktree per feature** so several features can progress at
once without stepping on each other, then (by default) dispatches a **background agent
into each worktree** to implement the feature, and reports results back.

Isolation via worktrees is what makes this safe: separate working directories, separate
branches, no half-staged files bleeding between features. It follows the exact worktree
setup contract in `CLAUDE.md` (env copy → deps → build shared-types).

## Step 1 — Gather the features

If the user hasn't already listed them, ask for the set of features. For each feature
collect:

- **Short name** → becomes the worktree dir + branch slug (kebab-case).
- **Description / task** → what the agent (or the user) should build.
- **Apps touched** → `mc`, `sign`, `flow`, main, functions (drives optional per-app `npm install`).

Confirm the derived branch names before creating anything, e.g. `feat/<name>`.
Ask which **base branch** to fork from (default `main`, per CLAUDE.md).

## Step 2 — Provision the worktrees

Use the bundled script — it handles worktree creation, env-file copying, dependency
installs, and shared-types build in one shot, skipping missing optional env files safely:

```bash
.claude/skills/parallel-work/setup-worktree.sh <name> feat/<name> <base> [--apps=mc,sign]
```

Run one invocation per feature. These are independent — **run them in parallel** (separate
background Bash calls) since each is a long `npm install`. Wait for all to finish before
dispatching agents.

If a run fails, surface the error and stop for that feature — don't dispatch an agent into a
half-provisioned worktree.

Verify at the end: `git worktree list` should show every new worktree on its branch.

## Step 3 — Dispatch background agents (default mode)

For each ready worktree, launch a background agent scoped to that worktree's absolute path.
Send them **in a single message with multiple Agent tool calls** so they run concurrently.

Pick `subagent_type` by the work: `react-firebase-engineer` for app features,
`backend-security-engineer` for functions, `scss-architect` for styling, else
`general-purpose`. Give each agent:

- The absolute worktree path (`/Users/talyaron/Documents/Freedi-app.worktrees/<name>`) and an
  instruction to work **only inside it**.
- The feature description and acceptance criteria.
- The house rules that matter: no `any`, CSS modules only in components, types from
  `delib-npm`/shared-types, structured `logError`, Firebase utilities, constants over magic
  numbers (all per `CLAUDE.md`).
- Instruction to run `npm run typecheck` / `npm run lint` in its worktree before finishing,
  and to **commit** when green (Tal's standing rule: commit finished, verified work; do not
  push or deploy without an explicit ask).
- Instruction to report a concise summary: what changed, files touched, check results.

Do **not** run dev servers or emulators from more than one worktree at a time — they share
`firebase.json` ports (CLAUDE.md). If an agent needs to run the app, tell it to use a
distinct port.

## Step 4 — Collect and report

As agents complete, relay each one's outcome (agents' final reports aren't shown to the user).
Give a per-feature status table: worktree, branch, checks passed?, committed?, summary.
Flag any feature that needs the user's attention.

## Worktrees-only variant

If the user only wants the environments (no agents), stop after Step 2 and hand back the
list of ready worktree paths with a `cd <path> && npm run dev` hint. They'll drive each one
themselves (or open a separate Claude session per worktree).

## Cleanup (when a feature is done/merged)

```bash
git worktree remove /Users/talyaron/Documents/Freedi-app.worktrees/<name>
git worktree list   # confirm
```

## Notes

- Emulators/dev servers: only one worktree at a time on default ports.
- The script's env-copy step tolerates missing optional env files (warns, continues).
- Existing worktrees at `Freedi-app.worktrees/`: agora, description-editor, mc-feature,
  statement-settings — pick fresh names to avoid collisions (`git worktree list`).
