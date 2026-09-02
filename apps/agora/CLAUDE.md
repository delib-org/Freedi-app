# Agora — working rules

A 45-minute classroom deliberation game. Mithril + Vite, Hebrew-first RTL, port
3009. Live at https://agora-wizcol.web.app (project `wizcol-app`).

The root `CLAUDE.md` applies except where this file says otherwise. Read
`docs/HANDOFF.md` before changing anything — it holds the gotchas that cost
real time.

## Before you edit

```bash
npm run preflight   # asserts emulators + seed + vite, and seeds if missing
npm run fast        # a session already at any stage, in ~4s
```

Run these **before** touching anything, not after. A change you cannot see is
a change you cannot judge.

## Where things go

```
views/            route and stage targets: render, and dispatch
components/       props in, vnodes out. No Firestore, no storage
lib/flows/        state machines with injected deps — tested in node
lib/              state modules, domain rules, i18n
lib/teacher.ts    teacher + join screens' Firestore calls
lib/proposals.ts  the student square's listeners and writes
lib/session.ts    the single session+participants listener
lib/voting.ts     the ballot
shared-types      schemas and ALL maths both the client and functions use
```

Firestore also lives in `lib/notifications.ts`, `seenState.ts`,
`digestPrefs.ts`, `topic.ts`, `values.ts` — and nowhere outside `lib/`.
Writes a student's points or standing depend on (votes, proposals,
suggestions, teacher saves) go through `lib/confirmedWrite.ts`; the rest
(seen-markers, digest prefs, notice fan-out) are fire-and-forget by design —
losing one costs a re-render, not a payout.

Rules of the road, each learned from something that broke:

- **A component never imports firebase.** `RateScale` did, and the app's most
  important write lived inside a widget.
- **Every number a student sees is server-written or computed by a shared-types
  function.** The client and the trigger once counted the class differently, so
  the projector and the phones disagreed about the same proposal.
- **Every write goes through `lib/`, and returns something the caller can
  believe.** Firestore answers from cache and queues silently: a write that
  never lands never rejects either. Use `lib/confirmedWrite.ts` — the only
  honest signal is a clock.
- **Rules before conventions.** If something must never happen, express it in a
  type or a security rule, not a comment.
- **No `any`.** Enforced. Unknown Firestore payloads are `Record<string,
  unknown>` and go through valibot.

## Styles

`src/styles/components/` — twelve partials, imported by `components.scss`. BEM,
tokens only, no hardcoded colours. **Not** CSS modules and not the root atomic
system: Mithril has no pipeline for either, and the single global import in
`index.ts` is deliberate.

`mock/surfaces.html` is the contrast gauntlet — it imports the real
stylesheets, so a stylesheet you delete must be removed from there too.

## Verifying

```bash
npm run check-all              # lint, typecheck, tests, build, contrast, type audit
node scripts/e2e-cycle.mjs     # the whole improvement loop, asserting POINTS in Firestore
node scripts/e2e-changes.mjs   # NEW/EDITED/IMPROVED chips and seen-state
node scripts/e2e-stuck-write.mjs  # a write that never reaches the server
npx tsx scripts/load-smoke.ts  # 30 students rating at once
```

The e2e scripts assert Firestore state, not pixels. That is the point: a
screenshot proves a screen rendered, not that a student was paid.

All five e2e scripts pass. `e2e-milestones.mjs` used to fail at a different
line each run: the milestone detector treats a proposal's first sighting on the
board as silent ("arriving is not a climb") and records the baseline rank, so on
a fast emulator every rating landed before the first scores snapshot and there
was no climb left to report. The app was right; the test was racing it. It now
waits for the baseline to exist and to be below the top before forcing the
climb.

## Deploying

```bash
npm run deploy:agora                        # hosting (from the repo root)
npm run deploy:f:prod -- agoraCreateSession  # functions, named explicitly
```

Three things bite:

1. **Indexes are not deployed by any script.** `deploy:rules:prod` covers rules
   and storage only, and a plain index deploy would prune the server-only
   indexes other apps depend on. Create them one at a time with `gcloud` — see
   HANDOFF.
2. **`.firebaserc` is gitignored.** Copy `.firebaserc.example`. The `agora`
   target maps to site `agora-wizcol` — the words are the other way round from
   what you would guess.
3. **A new origin needs two allowlists**: Firebase Auth authorised domains, and
   the Google Cloud API key's HTTP referrers. Missing the second fails with
   `auth/requests-from-referer-…-are-blocked`, which does not mention keys.
