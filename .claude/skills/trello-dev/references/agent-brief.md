# Sub-agent brief template

Fill every `<...>`. Keep the brief self-contained: the agent has no memory of this
conversation, and what you leave out it will guess. Dispatch with
`Agent({ subagent_type, model, isolation: "worktree", prompt })`.

```
You are implementing one Trello card for the Freedi monorepo, alone, in your own git worktree.

## The card
Trello card <shortLink>: <card title>
<card description, checklist items, and the relevant comments, verbatim or translated>

## What Tal agreed (decisions from the orchestrator's questions)
- <decision 1>
- <decision 2>

## Scope
Apps touched: <agora | mass-consensus (MC) | functions | studio | main app | ...>
Branch: feat/<slug>   (create it from dev in your worktree: `git checkout -b feat/<slug>`)
Out of scope: <what NOT to touch>

## First: make the worktree runnable
You are in a fresh worktree under .claude/worktrees/ with no env files, no node_modules and no
built shared packages. Run once, from your worktree root:

    bash /Users/talyaron/Documents/Freedi-app/.claude/skills/trello-dev/scripts/prep-worktree.sh "$PWD" --apps=<agora,mc,functions,...>

Wait for it to finish (it runs npm install; a few minutes). If it fails, stop and report.
<For Agora cards add: then run `npm run preflight` in apps/agora BEFORE editing (memory rule).>

## House rules (from CLAUDE.md - the orchestrator will check)
- No `any`. Types from `delib-npm` / `packages/shared-types` first.
- Components import only `*.module.scss`; design tokens, no hardcoded colors; BEM in SCSS.
- Errors: `logError(error, { operation, ... })` from `@/utils/errorHandling`, never bare console.error.
- Firebase refs via `@/utils/firebaseUtils`; timestamps in ms; constants from `@/constants/common`.
- New UI text goes through `useTranslation()` and gets keys in every language file of that app.
- Statement creation via `createStatementObject()` from shared-types.
- Files under 500 lines. Tests next to the code in `__tests__/`.

## Definition of done
1. The card's behavior works as described above.
2. For EVERY app you touched, run in that app's directory and paste the tail of each result:
   - `npm run typecheck`
   - `npm run lint`
   - `npm test` (`cd functions && npm test` when functions changed; `npm run test:rules` at the repo root when firestore.rules changed)
   A failure that you believe is pre-existing must be shown red on the base commit too
   (check out dev in a throwaway `git worktree add /tmp/base-check dev`, never `git stash`).
3. Commit on feat/<slug> with a conventional message (feat/fix(<app>): ...). Add only the files you changed.
   Do NOT push. Do NOT deploy. Do NOT touch /Users/talyaron/Documents/Freedi-app (the shared main tree).
4. Report, in this exact shape:
   - Branch + commit sha(s)
   - What the user now sees (2-4 lines)
   - Files touched
   - Check results per app (typecheck / lint / tests: pass counts or the failure)
   - What needs deploying (rules / function names / hosting target) - or "nothing"
   - Anything you could not do or had to decide alone

If the card is unclear in a way that changes the build, do not guess silently: build the most
likely reading, and list the assumption in the report.
```

## Choosing type and model

- Bug with clear repro, small UI change, i18n, a function tweak → `sonnet`,
  `react-firebase-engineer` (UI) or `backend-security-engineer` (functions/rules).
- Styling-only → `sonnet`, `scss-architect`.
- New screen or flow → `information-architect` (opus) first for the IA spec, then a
  `sonnet` implementer with the spec pasted in.
- Security, privacy, rules → `opus`, `backend-security-engineer` or `privacy-guardian`.
- Second attempt after a sonnet failure → `opus`, same type, failure output included.
