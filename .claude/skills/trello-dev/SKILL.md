---
name: trello-dev
description: Drive development from a Trello board with a team of sub-agents. The main session is the orchestrator - it reads the board through Claude in Chrome, triages cards with a cheap agent, confirms understanding with Tal, groups cards into lanes (one git worktree + one agent pipeline per lane, several in parallel), verifies with a reviewer agent, merges every green branch into local dev at the end, then comments on each card and moves it to done. Use whenever Tal mentions Trello, a board, cards, the sprint backlog, "work the board", "take the next card", "do the cards", or hands over a Trello link - even when he does not say "skill".
---

# Trello-driven development

You are the **orchestrator**. You never implement a card yourself. You read the board, agree
with Tal on what each card means, hand the work to sub-agents in isolated worktrees, check
their evidence, merge everything into local `dev` at the end, and move the cards. Your own
context is the scarce resource: anything over a handful of tool calls is delegated, and
every agent gets the cheapest model that can do its job.

Board access, write snippets and brief templates live in `references/`; helper scripts in
`scripts/`. Read a reference when you reach the step that needs it, not before.

## The team (models, agents, effort)

| Role | When | Model / agent | Effort |
|---|---|---|---|
| **Triage** | once per batch: apps, files, size, overlaps per card | `haiku` / `Explore` | low |
| **IA spec** | any new screen, flow, or "looks confusing" card | `opus` / `information-architect` | default |
| **Implementer** | the card itself | `sonnet` / `react-firebase-engineer` (UI), `backend-security-engineer` (functions, rules), `scss-architect` (styling only), `general-purpose` (mixed) | default |
| **Reviewer** | every M/L card after the implementer reports green | `sonnet` / `qa-code-auditor` | low |
| **Conflict resolver** | a branch that will not merge cleanly into dev | `sonnet` / `general-purpose` | default |
| **Rescue** | second attempt after a sonnet failure; tricky debugging; security, privacy, rules | `opus` / same type (or `system-architect`, `privacy-guardian`) | high |

Rules that keep this cheap:

- Start at the cheapest tier that fits; escalate only on evidence of failure. Say which
  model and agent you chose when you dispatch so Tal can override.
- Never use `subagent_type: "fork"` here. Briefs are self-contained; a fork drags your whole
  context into every agent.
- Continue an existing agent with `SendMessage` for a fix (same context, cheap). Start a
  fresh agent only when you change model or the agent's context is poisoned by a wrong path.
- Read agents' **reports**, not their diffs. The reviewer reads diffs; you read verdicts.
- Agents run in the background. Wait for the task notification; do not poll, do not do the
  agent's work while it runs.
- Three to five lanes at a time. Each lane runs its own `npm install`; more than five
  thrashes the machine and the merge step.
- If Tal says "use a workflow" or "ultracode", the same lanes may run through the `Workflow`
  tool; otherwise this skill uses the `Agent` tool only.

## Step 1 - Read the board

Default board: WizCol, `https://trello.com/b/u6sHplpi/wizcol` (lists: Backlog, reports,
Sprint backlog, doing, done). If Tal gives another link, use that and discover its lists.

Access is Claude in Chrome with Tal's login, no API token. Load the Chrome tools in one
`ToolSearch` call, open the board in a new tab, and run the **read snippet** from
`references/trello-browser-api.md`. It prints one line per card: `shortLink | list | name |
labels`. Work from the 8-character `shortLink`, never from the 24-hex `id` - the tool output
masks long ids as `[BLOCKED]`, and every snippet resolves names to ids inside the page.

Which cards to take, in order:
1. Cards already in **doing** that no session is working on (a running agent's card has a
   "Started by Claude" comment from this or another session).
2. **Sprint backlog**, top to bottom.
3. **Backlog** only if Tal says so.

Cards are terse, mostly Hebrew, mostly Agora (some MC = `apps/mass-consensus`, Studio,
Odyssey). Pull each candidate card's description, checklist and comments with the
"Card detail" snippet before deciding anything.

## Step 2 - Triage with one cheap agent

Dispatch **one** `haiku` `Explore` agent (`effort: "low"`) with all candidate cards pasted
in. It answers, per card, in a table you can forward to Tal:

- app(s) and the two to five files most likely to change
- size: **S** (one file, clear repro), **M** (a feature inside existing screens), **L** (new
  screen, new flow, new data shape, cross-app)
- which other cards in the batch touch the same files
- whether an IA spec is needed (new screen/flow, or the card says "confusing"/"looks bad")

You never grep the repo for this yourself. The triage table is the input to Steps 3 and 4.

## Step 3 - Confirm understanding before any work (Tal's rule)

For each card you intend to take, restate it in plain English in two or three sentences,
in terms of what the user sees on screen, and ask the one to three questions whose answer
changes the build. Batch all cards into one message (or one `AskUserQuestion` with one
question per card). Wait for the answers. Only then dispatch.

Skip the questions only when Tal has said "just go" / "no questions" for this batch, or the
card is unambiguous (a reported bug with a clear repro). Say that you are skipping and why.

## Step 4 - Group cards into lanes

A **lane** is one git worktree, one branch, one agent pipeline. Lanes run in parallel;
cards inside a lane run one after another.

- Cards that share no files → **one lane each**. This is the normal case and is why the
  worktrees exist: no half-staged files bleed between cards, and the branches merge cleanly.
- Cards that touch the same files (triage says so) → **one lane, one agent, cards in
  sequence**, one commit per card. Two agents editing the same file in two worktrees only
  produces a conflict you then pay a third agent to resolve.
- **L cards** get a pipeline inside their lane: IA agent first (its spec is pasted into the
  implementer's brief), then the implementer, then the reviewer. **M cards**: implementer
  then reviewer. **S cards**: implementer only; you verify the evidence yourself.
- A single S card with nothing else in flight still gets its own worktree. The main tree is
  shared with live sessions and is never an implementation target.

Branch per lane: `feat/<slug>` (or `fix/<slug>`), created from `dev`. For a multi-card lane
the branch name is the lane's theme and each card is its own commit.

## Step 5 - Mark the cards and dispatch the lanes

Per lane, in this order:

1. **Move each of its cards to doing** and post the comment `Started by Claude session
   <date>: <one-line plan>, branch feat/<slug>` (write snippet in the reference). The
   comment is how other sessions know not to take the same card.
2. **Dispatch the lane's first agent** with `isolation: "worktree"` (the Agent tool creates
   the worktree under `.claude/worktrees/agent-*`). The brief is the implementer template in
   `references/agent-brief.md` with the blanks filled. It tells the agent to run
   `scripts/prep-worktree.sh` first: a bare worktree has no env files, no `.firebaserc`, no
   `node_modules` and no built shared packages, and `typecheck` fails on files it never
   touched without them. For an L lane the first agent is the IA agent (no worktree needed;
   it only writes `docs/ia/<app>-<feature>.md` content into its report).
3. Send all lanes' dispatches for the batch **in one message** so they run concurrently.

Emulators and dev servers can run from only one tree at a time on the default ports; an agent
that must run the app uses the solo or alt port suite (CLAUDE.md).

## Step 6 - Verify each lane

An agent's confidence is not evidence. When an implementer reports, check in its worktree:

```bash
git -C <worktree> log --oneline dev..HEAD      # commits exist, one per card
git -C <worktree> status --short               # nothing left uncommitted
```

and read the typecheck, lint and test tails it pasted, for **every app it touched**
(`functions`' `npm test` when it touched functions; `npm run test:rules` when it touched
Firestore rules). A missing or red result → `SendMessage` the same agent once with the gap.
A second failure → one `opus` rescue agent with a fresh brief that includes the failure
output. A third failure → report to Tal; the card stays in doing. Do not fix it yourself
unless it is a one-line change.

For M and L cards, then dispatch the **reviewer** (`sonnet` `qa-code-auditor`, low effort,
reviewer template in the brief). Give it the card, Tal's decisions and the worktree path,
never your own conclusions. It returns: does the diff do what the card says, house-rule
violations (`any`, hardcoded colors, bare `console.error`, missing i18n keys), and a verdict.
Findings go back to the implementer via `SendMessage`; the reviewer runs once more only if
the fix was non-trivial.

Flaky or pre-existing failures: the agent must prove "pre-existing" by showing the same test
red on the base commit (in a throwaway worktree, never `git stash` in the shared main tree).
A pre-existing failure becomes a new Backlog card, not a reason to skip.

## Step 7 - Merge everything into dev

Merging happens **once, at the end of the batch**, after every lane is verified, so one
late lane never blocks the others and the merge order is yours. From the main tree:

```bash
bash .claude/skills/trello-dev/scripts/finish-batch.sh feat/<slug-1> feat/<slug-2> ...
```

The script refuses to run unless the main tree is on `dev` with no foreign uncommitted
changes to the files those branches touch, merges each branch `--no-ff` in the order given
(put lanes that touch the same app last, so conflicts surface where they are cheapest), and
**stops at the first conflict** after aborting that merge. On a conflict, dispatch a
**conflict resolver** (`sonnet`, resolver template in the brief) into that lane's worktree:
it rebases the branch onto current `dev`, re-runs the app's checks, and reports. Then re-run
the script with the remaining branches.

After the last merge, when two lanes touched the same app, run that app's `npm run
typecheck` once in the main tree: two green branches can still disagree. If it is red, a
sonnet agent in a fresh worktree off `dev` fixes it as its own `fix/` commit; do not edit
`dev` directly.

Never `git stash`, never switch the main tree's branch, never push, never deploy. Deploys
need Tal's explicit ask every time. If the main tree is on another branch or carries
someone else's edits to the same files, say so and merge inside one lane's worktree instead
(`git checkout dev` there is fine; it is the agent's tree), or ask Tal.

Then clean up:

```bash
bash .claude/skills/trello-dev/scripts/cleanup-worktrees.sh          # lists what is safe to remove
bash .claude/skills/trello-dev/scripts/cleanup-worktrees.sh --yes    # removes merged, clean worktrees
```

It removes only worktrees whose HEAD is already in `dev` and that have no uncommitted
changes; branches are kept. Worktrees of cards still in doing stay.

## Step 8 - Close the cards

Post the **done comment** and move each merged card to **done**. The comment is the record
Tal reads on his phone, so keep it short and concrete:

```
Done by Claude (<date>) - merged into local dev <short-sha>
What changed: <2-4 lines, what the user sees>
Branch: feat/<slug>  Commits: <sha..sha>
Checks: typecheck ✓ lint ✓ tests ✓ (<app>: N passed)  Review: ✓ <model>
To deploy: <none | rules | functions: fnA fnB | hosting: agora> - NOT deployed, NOT pushed
Open questions: <none | ...>
```

If a card is only partly done, leave it in **doing** with a comment saying what remains
and why, and tell Tal. Never move a card to done that you did not verify and merge.

## Step 9 - Report to Tal

One table for the batch: card, lane/branch, model(s) used, checks, review, merged into
dev?, deploy needed, notes. Then what you recommend next (next cards, or a deploy list for
his OK). Plain short English, no jargon - describe what changed on screen.

When the batch is done, save a `project` memory note for anything not derivable from git:
decisions Tal made in Step 3, deploy order, cards left in doing.

## Etiquette

- Cheap first, escalate on evidence. Say the model you used.
- The main tree is shared by live sessions: never stash, never switch its branch, never
  reset it. Unexplained modified files there are someone else's work.
- One agent per lane at a time; the reviewer starts only after the implementer is green.
- Tal's standing rules in memory apply: commit finished work, deploy only on ask, talk in
  simple English, paragraphs/types/firebase/error conventions from `CLAUDE.md`.
