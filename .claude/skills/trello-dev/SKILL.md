---
name: trello-dev
description: Drive development from a Trello board with a team of sub-agents. The main session is the orchestrator - it reads the board through Claude in Chrome, marks the cards it takes, then runs the parallel-work skill (cheap triage, confirm understanding with Tal, lanes of agents in worktrees, reviewer, one merge into local dev at the end, worktree cleanup, deploy command list + one permission question), and finally comments on each card and moves it to done. Use whenever Tal mentions Trello, a board, cards, the sprint backlog, "work the board", "take the next card", "do the cards", or hands over a Trello link - even when he does not say "skill".
---

# Trello-driven development

You are the **orchestrator**. You never implement a card yourself. This skill owns only
the Trello side: reading the board, marking cards, closing cards. Everything between -
triage, confirming understanding, lanes, dispatch, verification, merge, worktree cleanup,
the report and the deploy question - is the **`parallel-work`** skill, followed exactly.
Read `/Users/talyaron/Documents/Freedi-app/.claude/skills/parallel-work/SKILL.md` when
you reach Step 3; its templates are in `parallel-work/references/` and its scripts in
`parallel-work/scripts/`.

Board access snippets live in `references/trello-browser-api.md`. Read it at Step 1.

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

## Step 2 - Turn cards into tasks

Each card is one `parallel-work` task:

- `id` = the card's 8-char shortLink
- `title` = the card name
- `spec` = description + checklist items + relevant comments, verbatim or translated
- source = the Trello card

Keep the card's shortLink in every commit message suffix (`(Trello <shortLink>)`) and in
the branch comment, so the card and the commit find each other later.

## Step 3 - Run parallel-work, Steps 2 to 10

Follow the `parallel-work` skill from its Step 2 (triage) through Step 10 (deploy list and
one permission question), with the task list from Step 2 above. Two Trello-specific twists:

1. **Mark the cards before dispatching a lane** (between parallel-work Steps 4 and 5).
   For every card in the lane: move it to **doing** and post the comment
   `Started by Claude session <date>: <one-line plan>, branch feat/<slug>` (write snippet
   in the reference). The comment is how other sessions know not to take the same card.
2. **A pre-existing failure becomes a new Backlog card**, not a reason to skip. Create it
   with the "create card" snippet and mention it in the report.

Everything else - models, lanes, `prep-worktree.sh`, `finish-batch.sh`,
`cleanup-worktrees.sh`, the deploy map, the `AskUserQuestion` before any deploy - is
exactly as parallel-work says. Nothing here deploys or pushes on its own.

## Step 4 - Close the cards

After the batch merge (parallel-work Step 7) and before the deploy question, post the
**done comment** and move each merged card to **done**. The comment is the record Tal
reads on his phone, so keep it short and concrete:

```
Done by Claude (<date>) - merged into local dev <short-sha>
What changed: <2-4 lines, what the user sees>
Branch: feat/<slug>  Commits: <sha..sha>
Checks: typecheck ✓ lint ✓ tests ✓ (<app>: N passed)  Review: ✓ <model>
To deploy: <none | npm run deploy:rules:prod | npm run deploy:f:prod -- fnA fnB | npm run deploy:agora> - NOT deployed, NOT pushed
Open questions: <none | ...>
```

If a card is only partly done, leave it in **doing** with a comment saying what remains
and why, and tell Tal. Never move a card to done that you did not verify and merge.

After a deploy Tal approved in parallel-work Step 10, update each card's done comment from
"NOT deployed" to "deployed <date>: <targets>".

## Etiquette (Trello-specific; the rest is in parallel-work)

- The "Started by Claude" comment is the lock. Check for it before taking a doing card.
- Cards keep their shortLink through branch comment, commit suffix and done comment.
- Never move a card to done that you did not verify and merge.
- The memory note at the end of the batch records which cards were left in doing and why.
