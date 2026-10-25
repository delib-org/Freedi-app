# Agora: port the chat-branch improvements back into the "places" (screens) UI

**Written 2026-08-05, before a context refresh — this file is the working plan. Read it fully before acting.**

## Context

The deliberation stage was rebuilt as a chat-bot guided conversation on branch `feat/agora-chat-deliberation` (12 commits on top of `agora-places-ui-backup`, which preserves the old "places"/screens UI at dev-before-chat, commit `e2b7457a4`). After a day of playtesting, Tal's verdict: **the chat feels tiresome, not like a game.** He wants to try the screens system again — but keeping the genuinely good improvements built during the chat work.

Tal is working with a UX expert TODAY and must be able to **switch between the two solutions live** to compare them.

## Goal

Create branch **`feat/agora-places-improved`** so that:
- `feat/agora-chat-deliberation` = chat solution (frozen, do not touch)
- `feat/agora-places-improved` = the old screens UI + the ported improvements
- `agora-places-ui-backup` = pristine reference (NEVER commit to it)
- Switching = `git checkout <branch>` + browser refresh. Both branches must share IDENTICAL `packages/shared-types` and `functions/` content so no rebuilds or emulator restarts are needed when switching.

## Branch strategy (the key decision)

Branch **from `feat/agora-chat-deliberation` HEAD (`658c6a0a5`)**, then surgically restore the places view from the backup. Do NOT branch from the backup and cherry-pick — the chat commits mix view rewrites with shared/backend changes and won't apply cleanly.

This keeps automatically (already in HEAD, UI-agnostic — verify they survive):
- `packages/shared-types`: `AgoraSuggestionStatus.implemented`, `NotificationTriggerType.AGORA_SUGGESTION_IMPLEMENTED`
- `functions/src/agora/fn_agoraResolveSuggestion.ts`: accepted→implemented transition (server-validated, idempotent, NO extra points), "woven in" notification
- `apps/agora/src/lib/proposals.ts`: `statementsLoaded`/`evaluationsLoaded` flags (harmless for places UI)
- `apps/agora/src/lib/notifications.ts`: AGORA_SUGGESTION_IMPLEMENTED → glitter celebration (`celebrate.suggestion_implemented`)

## Step-by-step

### 1. Create the branch
```bash
git checkout feat/agora-chat-deliberation && git checkout -b feat/agora-places-improved
```

### 2. Restore the places view
```bash
git checkout agora-places-ui-backup -- apps/agora/src/views/Deliberation.ts
```
- `GameController.ts`: swap import + the `deliberation` case back to `Deliberation` (from `DeliberationChat`).
- KEEP `DeliberationChat.ts`, `chatFlow.ts`, `ChatBubble.ts`, chatFlow tests, and the `chat.scss` import in `src/index.ts` — unimported view code tree-shakes away, the tests keep passing, and the diff between the two branches stays minimal. `chat.scss` stays because the ported accordion/checkbox styles live there (`.chat-drawer*` blocks).

### 3. Restore the deleted SCSS (places blocks)
The chat branch deleted these top-level blocks from `apps/agora/src/styles/components.scss`: `.cycle-strip`, `.place-banner`, `.workbench__section/__head/__icon/__title/__count`, `.stand-poster`, `.advice-note`, `.delib-splash`, `.delib-nav`, `.shell--place-mine/-square/-visit` (plus a comment banner block). Restore them from the backup — easiest is to take the whole old file and re-apply the ONE post-backup addition:
```bash
git checkout agora-places-ui-backup -- apps/agora/src/styles/components.scss
```
then re-add the `&--implemented` modifier under `.helped__item &__chip` (filled green: `border-color: var(--success); background: var(--success); color: #ffffff; box-shadow: 0 0 10px rgba(23,128,77,0.35);`) — it sits right after `&--accepted`.

### 4. Restore the retired i18n keys
The chat branch removed ~63 keys the places view needs (`place.*`, `round.splash_title`, `delib.cycle_round/step_*/nav_*/to_rating/to_helping/skip_help/finish_cycles/cycle_done_*/keep_helping/rate_done/rate_hint/help_hint/nothing_to_rate/next_proposal/no_more/suggestions_received/helped_title/…`). Do NOT restore the whole old i18n.ts (it lacks all the new keys). Instead:
1. `git show agora-places-ui-backup:apps/agora/src/lib/i18n.ts > /tmp/old-i18n.ts`
2. Grep the RESTORED `Deliberation.ts` + `ScoreHud.ts` for every `t('…')` key; for each key missing from the current i18n.ts, copy its line (all 6 language blocks: he/en/ar/es/de/nl — same order in both files) from the old file. Watch for two-line values (key line ends with `:`).
3. Sanity script (used before, keep the pattern): parse each block, assert all 6 have identical key sets, and assert every `t('…')` literal in src resolves. `hud.class_hint_${step}` is built dynamically — keep all `hud.class_hint_*`.

### 5. Port the improvements INTO the places `Deliberation.ts`
The places UI already has (do not rebuild): stand-poster + advice-note help screen (the chat's poster/note composer was resurrected FROM here), suggestions-received stream with accept/thank/decline + accept-hint, helped section with re-rate scale + "improved since your idea" + follow-up box + toast/badge, ownership chips everywhere.

Port these (all were built and browser-verified on the chat branch — copy the logic from `DeliberationChat.ts`, it is still in the tree):

**a. Accepted-ideas accordion with checkboxes** → inside `editableProposalCard()` (the "mine" workshop card), directly under the edit box + its Update button, ABOVE the suggestions-received drawer:
- Reuse the `.chat-drawer*` markup/classes verbatim from `DeliberationChat.ts` `myProposalCard()` (accordion header "💡 `chat.accepted_reminder`" + orange count badge + circled chevron; items = suggestions with status accepted OR implemented; each row = custom checkbox + text).
- Checkbox semantics (Tal's spec, verified live): **tick = LOCAL pending mark** (`wovenPending` record, freely untickable, arms the Update button via `disabled: !changed && !hasPendingWoven`); **only saving the proposal** resolves ticked ideas via `resolveSuggestion(sessionId, id, AgoraSuggestionStatus.implemented)` (fire-and-forget with console.error), so the suggester's announcement always arrives together with a real change. Implemented rows render the checkbox checked+disabled.
- The hidden checkbox input MUST keep `pointer-events: none` (already in chat.scss) — without it the invisible input intercepts clicks (cost us an hour of Playwright debugging).
- Collapsed by default; OPEN it when the just-accepted flow lands the student here (places equivalent: after clicking accept in the suggestions stream, set the drawer open — the edit box is right above, which already satisfies "accept walks you to the editor").

**b. Implemented status surfaces**:
- `suggestionsSection()` resolved-chip ternary: add `implemented` → `✓ ${t('delib.implemented')}` (check FIRST, before accepted).
- `helpedItem()` `statusKey()`: add `implemented → 'delib.implemented'` as the first case; chip class modifier `helped__chip--implemented` comes free from the status value.

**c. i18n keys already present on this branch** (added during chat work, keep): `delib.implemented`, `chat.mark_woven`, `chat.accepted_reminder`, `celebrate.suggestion_implemented` — all ×6 languages.

**Skip (chat-only, do not port)**: guide bubbles/menu/nudges (incl. `chat.nudge_helped_changed` — places uses toast+badge instead), chat transcript/typing, `docs/chat-guide-rules.md` (leave in tree, it documents the chat branch), the chat my-feedback scoreboard removal (places keeps its scoreboard panels for now — REVIEW WITH THE UX EXPERT; Tal earlier said "later we will add scoring board").

### 6. Walkthrough script
Current `scripts/walkthrough.mjs` drives the CHAT flow. Restore the places version and extend it:
```bash
git checkout agora-places-ui-backup -- apps/agora/scripts/walkthrough.mjs
```
Then add after the accept step: S1 opens the accepted-ideas drawer (`.chat-drawer__head`), ticks `.chat-drawer__check-box`, asserts S2 got NO celebration yet (~2.5s window), edits + saves via `.my-lantern__save`, then asserts S2's "woven in" celebration + `.helped__chip--implemented`. (Selectors verified on the chat branch; the drawer classes are identical.)

### 7. Verify
- `cd apps/agora && npx tsc --noEmit && npm run lint && npx vitest run` (chatFlow tests still pass — files untouched)
- `npm run build`
- Emulators: **currently DOWN** (background-task restarts kept getting killed — run in Tal's own terminal: `firebase emulators:start --project freedi-test --only hosting:dev,firestore,auth,functions,storage,database`, then `cd apps/agora && npm run seed`). Functions were already rebuilt with the `implemented` code; if `functions/lib` is stale on this branch, `cd functions && npm run build`. shared-types dist likewise (`cd packages/shared-types && npm run build`) — content is identical on both branches, so build once and never again when switching.
- Run `node scripts/walkthrough.mjs` end-to-end (Playwright; two students; fixtures need no API key).
- Manual Hebrew check of the workshop screen: accordion under the edit box, checkbox flow, helper's celebration + chip.

### 8. The comparison session (for the UX expert)
- Vite dev server on port 3009 serves whatever branch is checked out (HMR picks up the switch; hard-refresh the browser tabs after switching).
- `git checkout feat/agora-chat-deliberation` ↔ `git checkout feat/agora-places-improved` — no rebuilds needed (shared-types/functions identical by construction; VERIFY with `git diff feat/agora-chat-deliberation feat/agora-places-improved -- packages functions` → must be empty).
- Create a FRESH session after each switch (deliberation-stage client state differs: `agora_{sid}_cycle` vs `agora_{sid}_chatflow` — both sessionStorage-namespaced, no clash, but a mid-game switch lands mid-flow confusingly).
- Emulator + seed survive branch switches; only browser refresh needed.

## Improvement inventory (what the chat branch built — for reference)
`git log agora-places-ui-backup..feat/agora-chat-deliberation`:
- `3853b3aea` chat rebuild (chat-only) + `a99f317f2` quote-in-composer (superseded by poster/note)
- `97b83c4f3` poster+sticky-note composer (places already has the original)
- `0cefddb5b` scoreboard removed from chat feedback card (places: keep, review with UX expert)
- `e2c90b261` accept→walk-to-editor + `docs/chat-guide-rules.md` (concept ports as drawer-opens-after-accept)
- `98d8631d9`+`e1af45122`+`dbe771ade`+`12f17031c` accepted-ideas accordion (PORT — final form only)
- `3d27aa46c` helper nudge (chat-only; places has toast+badge)
- `4d1c7613e` **woven-in lifecycle: shared-types + cloud fn + chips + celebration (KEEP/PORT — the crown jewel)**
- `658c6a0a5` **checkbox + pending-until-save announcement (PORT)**

## Hard-won gotchas (do not rediscover)
- Playwright `locator.click()` binds once and never rebinds unless the element detaches — always target `:not([disabled])` for controls that have disabled twins elsewhere on the page.
- Never gate interactive content behind timer/rAF chains (occluded tabs stall them).
- Custom checkbox: hidden input needs `pointer-events: none`.
- Firestore emulator's gRPC channel degrades after ~a day → functions get `2 UNKNOWN` / 60s timeouts while the web app still works. Fix = emulator restart (+ re-seed). Read errors via websocket on the logging emulator (port 4500) when firebase-debug.log is unreadable.
- i18n rule: every key in ALL SIX blocks; beware two-line values when scripting edits.
- Mithril: never mix keyed and unkeyed children in one fragment.
- `deploy TODO (when this ships): functions deploy needed for agoraResolveSuggestion (implemented transition), per feedback_use_deploy_scripts.`
