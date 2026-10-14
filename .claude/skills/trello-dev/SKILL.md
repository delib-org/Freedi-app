---
name: trello-dev
description: Drive development from a Trello board. The main session is the orchestrator - it reads the board through Claude in Chrome, picks cards, confirms understanding with Tal, dispatches one cheap sub-agent per card into its own git worktree, verifies tests, merges, then comments on the card and moves it to done. Use whenever Tal mentions Trello, a board, cards, the sprint backlog, "work the board", "take the next card", "do the cards", or hands over a Trello link - even when he does not say "skill".
---

# Trello-driven development

You are the **orchestrator**. You do not implement cards yourself. You read the board,
agree with Tal on what each card means, hand each card to a sub-agent in its own worktree,
check the result, merge it, and move the card. Your own context is the scarce resource:
keep it lean, delegate anything that takes more than a few tool calls, and give every
sub-agent the cheapest model that can do its job well.

Board access, write snippets and the brief template live in `references/`. Read them
when you reach the step that needs them, not before.

## Model policy (why: Tal's days are long and tokens run out)

| Work | Model | Agent type |
|---|---|---|
| Lookups, "where is X", reading a card's thread, triage | `haiku` | `Explore` |
| Routine implementation: UI, functions, tests, i18n, styling | `sonnet` | `react-firebase-engineer`, `backend-security-engineer`, `scss-architect`, `general-purpose` |
| Hard design, architecture, tricky debugging, a card whose first sonnet attempt failed | `opus` | `system-architect`, `information-architect`, or the same type at opus |
| Orchestration (this session) | your own model | - |

Start at the cheapest tier that fits and escalate only on failure. Say which model you
chose when you dispatch, so Tal can override.

## Step 1 - Read the board

Default board: WizCol, `https://trello.com/b/u6sHplpi/wizcol` (lists: Backlog, reports,
Sprint backlog, doing, done). If Tal gives another link, use that and discover its lists.

Access is Claude in Chrome with Tal's login, no API token. Load the Chrome tools in one
`ToolSearch` call, open the board in a new tab, and run the **read snippet** from
`references/trello-browser-api.md`. It prints one line per card: `shortLink | list | name |
labels`. Work from the 8-character `shortLink`, never from the 24-hex `id` - the tool output
masks long ids as `[BLOCKED]`, and every snippet resolves names to ids inside the page.

Which cards to take, in order:
1. Cards already in **doing** that no session is working on (check the card's latest
   comment; a running agent's card has a "started" comment from this or another session).
2. **Sprint backlog**, top to bottom.
3. **Backlog** only if Tal says so.

Cards are terse, mostly Hebrew, mostly Agora (some MC = `apps/mass-consensus`, Studio,
Odyssey). Read each card's description, checklist and comments before deciding anything
(the "Card detail" snippet in the same reference).

## Step 2 - Confirm understanding before any work (Tal's rule)

For each card you intend to take, restate it in plain English in two or three sentences,
in terms of what the user sees on screen, and ask the one to three questions whose answer
changes the build. Batch all cards into one message (or one `AskUserQuestion` with one
question per card). Wait for the answers. Only then dispatch.

Skip the questions only when Tal has said "just go" / "no questions" for this batch, or the
card is unambiguous (a reported bug with a clear repro). Say that you are skipping and why.

UX-heavy cards ("looks bad", "confusing", a new screen or flow) go through the
`information-architect` agent first, per CLAUDE.md; its IA spec becomes part of the brief.

## Step 3 - Mark the card and dispatch

Per card, in this order:

1. **Move the card to doing** and post a comment: `Started by Claude session <date>: <one-line
   plan>, branch feat/<slug>`. Use the write snippets in `references/trello-browser-api.md`.
   The comment is how other sessions know not to take the same card.
2. **Dispatch one background sub-agent** with `isolation: "worktree"` (the Agent tool
   creates the worktree under `.claude/worktrees/agent-*`). Pick model and type from the
   table above. The brief is `references/agent-brief.md` with the blanks filled; it tells
   the agent to run `scripts/prep-worktree.sh` first, because a bare worktree has no env
   files, no `.firebaserc`, no `node_modules` and no built shared packages, and `typecheck`
   fails on files it never touched without them.
3. Send all dispatches for the batch **in one message** so they run concurrently. Three to
   five cards at a time is the comfortable limit: each worktree runs its own `npm install`,
   and emulators or dev servers can only run from one tree at a time on the default ports
   (solo/alt port suites exist, see CLAUDE.md, if an agent must run the app).

Do not do the agent's work while it runs. Wait for the task notification.

## Step 4 - Verify the result

The agent's report is not shown to Tal, and an agent's confidence is not evidence. When it
finishes, check in its worktree:

```bash
git -C <worktree> log --oneline dev..HEAD      # commits exist
git -C <worktree> status --short               # nothing left uncommitted
```

and read the test, typecheck and lint output it pasted. The brief requires the agent to run,
for every app it touched, that app's `npm run typecheck`, `npm run lint` and `npm test`
(plus `functions`' `npm test` when it touched functions and `npm run test:rules` when it
touched Firestore rules). If a result is missing or red, send the agent back with
`SendMessage` once (same context, cheap). If it fails a second time, escalate to the next
model tier with a fresh brief that includes the failure, or report to Tal - do not fix it
yourself unless it is a one-line change.

Flaky or pre-existing failures: the agent must prove "pre-existing" by showing the same test
red on the base commit (`git stash` is forbidden in the shared main tree; a worktree is
fine). A pre-existing failure becomes a new Backlog card, not a reason to skip.

## Step 5 - Merge

Merge the card's branch into local `dev` from the **main tree**
(`/Users/talyaron/Documents/Freedi-app`), which other sessions share:

```bash
git -C /Users/talyaron/Documents/Freedi-app status --short   # foreign edits? leave them, mention them
git -C /Users/talyaron/Documents/Freedi-app branch --show-current   # must be dev; never switch a tree someone else is using
git -C /Users/talyaron/Documents/Freedi-app merge --no-ff feat/<slug> -m "Merge feat/<slug> into dev: <card title>"
```

If the main tree is on another branch or has foreign uncommitted changes, merge in the
agent's worktree instead (`git checkout dev` there is fine, it is the agent's tree) or ask
Tal. Never `git stash`, never push, never deploy - deploys need Tal's explicit ask every
time. After a merge, run `npm run typecheck` once in the merged tree when two cards touched
the same app, because two green branches can still conflict.

## Step 6 - Close the card

Post the **done comment** and move the card to **done**. The comment is the record Tal reads
on his phone, so keep it short and concrete:

```
Done by Claude (<date>) - merged into local dev <short-sha>
What changed: <2-4 lines, what the user sees>
Branch: feat/<slug>  Commits: <sha..sha>
Checks: typecheck ✓ lint ✓ tests ✓ (<app>: N passed)
To deploy: <none | rules | functions: fnA fnB | hosting: agora> - NOT deployed, NOT pushed
Open questions: <none | ...>
```

If the card is only partly done, leave it in **doing** with a comment saying what remains
and why, and tell Tal. Never move a card to done that you did not verify.

## Step 7 - Report to Tal

One table for the batch: card, branch, checks, merged into dev?, deploy needed, notes. Then
what you recommend next (next cards, or a deploy list for his OK). Plain short English, no
jargon - describe what changed on screen.

When the batch is done, save a `project` memory note for anything not derivable from git:
decisions Tal made in Step 2, deploy order, cards left in doing.

## Memory and etiquette

- Cheap first, escalate on evidence. Say the model you used.
- The main tree is shared by live sessions: never stash, never switch its branch, never
  reset it. Unexplained modified files there are someone else's work.
- Worktrees from finished cards can be removed after merge (`git worktree remove <path>`);
  the branch stays. Leave worktrees of cards still in doing.
- Tal's standing rules in memory apply: commit finished work, deploy only on ask, talk in
  simple English, paragraphs/types/firebase/error conventions from `CLAUDE.md`.
