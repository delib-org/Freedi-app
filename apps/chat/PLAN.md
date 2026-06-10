# Dialectical Chat App (`apps/chat`) — Consolidated Plan

*Single executable spec. Supersedes the layered r1/r2/r3 drafts (see Revision history at the bottom).*

## Goal & priorities

A **Dialectical Chat Platform** (`apps/chat/architecture.md`): a debate tool that turns assertion into evidence-weighted reasoning. Every reply is typed; threads nest; an AI scores each piece of evidence against its parent and an AI engine synthesizes summaries + revised statements. Three hard priorities, non-negotiable:

1. **SEO / crawlable** — server-rendered HTML per question.
2. **Minimal download size** — no Firebase in the first HTML payload; the client SDK is a lazy chunk.
3. **Blazing-fast UI updates** — fine-grained reactivity; live `onSnapshot` after hydration.

**Stack:** SvelteKit (SSR via `adapter-node`, ~1–2KB runtime) + Firebase, reusing the FreeDi backend — `@freedi/shared-types` (`Statement`, framework-agnostic) and the existing AI/evaluation/version-control Cloud Functions. Reference impl (Svelte + Socket.io, simulated AI) at `/Users/talyaron/Documents/chat-tests`.

---

## 1. Domain model

### 1.1 Node kinds (`statementType`) and containment
`statementType` decides what a node **is** and what children it may have. Chatter reuses the existing **`StatementType.statement`** (UI label "Standard"); we add **`StatementType.evidence`** as a first-class kind. Allowed edges (validated at write time by `lib/tree/containment.ts`, which also rejects cycles):

```
question  →  option | question                 a question is answered by options, refined by sub-questions
option    →  evidence | statement | question   the claim under test
evidence  →  evidence | statement              evidence about evidence (recursive; you can critique a critique)
statement →  statement                          chatter; never scored, no C
```

- **`question`** — asked thing. Root (a conversation) or sub-question anywhere. Children: options + sub-questions. **Has no truth value → no `C`**; carries *aggregates* instead (§1.4).
- **`option`** — a proposed answer; **the claim under test**. Voted; carries `C`. Children: evidence, chatter, sub-questions.
- **`evidence`** — a strengthen/critique node. `statementType: evidence`; **`dialecticType` (`strengthen | critique`) is its polarity** (sets the sign in corroboration). Carries `C`; AI-scored. Recursive.
- **`statement`** — chatter. `dialecticType: standard`. No score, no AI.

`createStatementObject()` is used for **all** node creation (never hand-construct). Drop the legacy `group` root type — a conversation root is a `question` with `isRoot: true`.

### 1.2 The two scoring mechanisms (each behind a stable, versioned contract)
1. **`corroboration.ts`** *(to be authored in Phase 1; designed but not yet committed)* — recursive **Popperian–Bayesian** scorer. Every `option`/`evidence` node has `C ∈ [0,1]`. A child's effect on its parent is its own `C`; the **edge type only sets the sign** (`strengthen/corroborate` +, `critique/falsify` −). Base credibility = Bayesian shrinkage of direct votes toward a prior (`κ = N/(N+k)`); independent siblings aggregate by **noisy-OR**; support/attack combine by **DF-QuAD**; tree scored bottom-up.
2. **`EvidenceScorer`** — swappable AI mechanism. On an *evidence edge only*, it classifies the reply w.r.t. its parent: **relation** (corroborate/falsify/neutral), **evidenceClass** (anecdote … meta-analysis), **baseStrength**, **confidence**, **independenceFactor** (dedup discount), **effectiveWeight**, plus `rationale` + raw `features`. It feeds `corroboration.ts` through four numeric seams (§1.3). The app, the functions, and `corroboration.ts` depend only on the `EvidenceScorer` / `IndependenceEstimator` **contracts** — never internals. Every verdict retains `features` so a new scorer version can re-score history offline and be A/B'd.

### 1.3 How the scorer feeds corroboration (the four seams)
1. **relation → edge sign / `dialecticType`.** `corroborate→strengthen` (+), `falsify→critique` (−), `neutral→` no effect.
2. **evidenceClass → per-node Bayesian prior.** `p0_i = baseStrength` (meta-analysis enters ~0.90, anecdote ~0.10).
3. **confidence → prior firmness.** Low confidence blends `p0_i` toward 0.5 so votes dominate sooner.
4. **independenceFactor → aggregation.** Discounts each sibling's contribution inside noisy-OR, so duplicate/coordinated reports stop multiplying.

DF-QuAD and the bottom-up pass are unchanged. **Evidence quality enters once (the prior); `effectiveWeight = independenceFactor`** (no double-counting).

### 1.4 Where `C` lives, and question aggregates
- **`corroborationScore` (denormalized `C`) is populated only on `option` and `evidence` nodes.** Questions and chatter leave it empty.
- **A `question` carries aggregates instead**, denormalized for SSR/discovery and recomputed by the unified ancestor pass (§4.4):
  - `optionCount` — number of direct `option` children.
  - `leadingOptionId` — the option child with max `C`.
  - `convergenceIndex` ∈ [0,1] — separation of the leader from the field (§1.5).
  - `lastActivityAt` — bumped on any descendant write.

### 1.5 Convergence metric (pluggable seam)
`convergenceIndex` is a swappable metric behind a `ConvergenceMetric` contract (same philosophy as the scorer — the user's research metric drops in here later). **v1 proxy** over a question's option children, sorted by `C` descending:
```
convergenceIndex = C(1) * (C(1) − C(2))          // ≥2 options: strong leader AND clearly ahead
                 = C(1)                            // exactly 1 qualifying option
                 = 0                               // no options / all near prior
```
Range [0,1]. Documented as a proxy in `packages/evidence`; replacing it touches one module.

---

## 2. Visibility (three tiers)

Visibility is a property of the **root question only**; the subtree **inherits** it (mixed-visibility subtrees are out of scope — open problem §8). It is **denormalized onto every node** (changes ~never) so security rules and the per-doc `onSnapshot` can decide without a `get()`.

| tier | in discovery | read path | client listener | SSR / SEO | Firestore read rule |
|---|---|---|---|---|---|
| **public** | yes | anonymous | unauthenticated | yes, indexed | `read: true` |
| **unlisted** | no | by link | unauthenticated | yes, `noindex` | `read: true` |
| **private** | no | members only | **authenticated** | **no** (auth-gated server read; never indexed) | `read: if uid in memberIds` |

**`firestore.rules`:**
```
match /statements/{id} {
  allow read: if resource.data.visibility in ['public','unlisted']
              || (request.auth != null && request.auth.uid in resource.data.memberIds);
  // writes always go through the server (admin SDK + callables).
}
```

**Auth model reconciled (fixes the r1/r2 "no client auth" claim):**
- *First HTML payload has zero Firebase for all tiers* (SSR via admin). That guarantee is unchanged.
- *Public/unlisted live updates:* the lazy realtime chunk is `firebase/app` + `firebase/firestore` only — **no auth SDK** (rules allow anonymous read).
- *Private live updates:* the realtime chunk additionally needs `firebase/auth`, because the rule requires `request.auth.uid`. The user already signed in (client Google sign-in minted the session cookie); Firebase Auth client state persists (IndexedDB), so `onSnapshot` runs authenticated. If client auth state is missing, mint a short-lived **custom token** server-side from the session cookie to re-init; else degrade to SSR-only + periodic revalidate. Private is the non-SEO path, so the extra chunk is acceptable.
- *Private SSR:* `+page.server.ts` verifies `locals.user ∈ memberIds` **in code** before the admin read (admin bypasses rules); non-members get 403 / sign-in redirect; page emits `noindex`.

**`memberIds` (private):** denormalized onto every node (v1 assumes small invited groups); a membership-change callable updates the subtree in a batch. Revisit if private groups grow (open problem §8). Invite tokens: `invites/{token}` → `{ topParentId, role, invitedBy, expiresAt }`; redeem at `/invite/[token]` (lazy Google sign-in → callable adds uid → marks token used; expirable/revocable).

---

## 3. Authority resolution (decided)

The user's pill is a **hint**; the **AI verdict is authoritative for direction and weight**, except when AI `confidence` is low, where the pill wins. Both are shown; `rationale` is displayed and contestable.
- `confidence ≥ τ_conf` → `relation`/weight from the verdict (pill shown as "user marked…").
- `confidence < τ_conf` → `relation` from pill, `baseStrength` = `fallbackByPill`, flagged `lowConfidence` (still `source:'ai'`, tentative class shown).
- scorer error/timeout → hard fallback: `relation` from pill, default weight, `confidence:0`, `source:'user-fallback'`. **Never hard-fail the write.**

*Why:* evidence judgement (not self-label) should drive weight, but an uncertain model should defer to the poster's intent; showing both keeps it auditable/falsifiable.

---

## Phase 1 — Shared types + `@freedi/evidence` package

### 1a. `packages/shared-types`
`src/models/TypeEnums.ts` — add:
```ts
export enum DialogicType    { standard='standard', strengthen='strengthen', critique='critique' }
export enum EvidenceRelation{ corroborate='corroborate', falsify='falsify', neutral='neutral' }
export enum EvidenceStatus  { pending='pending', scored='scored', fallback='fallback' }
export enum Visibility      { public='public', unlisted='unlisted', private='private' }
// StatementType: add `evidence` (alongside existing question, option, statement). Do NOT add `standard`/`group`.
```
`src/models/statement/StatementTypes.ts` — after `replyTo` (~line 280), add (all `optional`; denormalized for SSR/UI — authoritative verdict history lives in `evidenceVerdicts`):
```ts
dialecticType:      enum_(DialogicType),     // polarity of an evidence node; 'standard' on chatter
dialecticSnapshot:  boolean(),               // archived revision snapshot; tree-builder skips
isRoot:             boolean(),               // true on a conversation root (enables the discovery query)
visibility:         enum_(Visibility),       // root-authoritative; denormalized to every node
memberIds:          array(string()),         // private only
// active evidence verdict (option/evidence nodes):
relation:           enum_(EvidenceRelation),
evidenceClass:      string(),
effectiveWeight:    number(),                // [0,1] applied in noisy-OR
evidenceConfidence: number(),               // [0,1]
evidenceStatus:     enum_(EvidenceStatus),   // drives the "evaluating…" chip
activeScorerVersion:string(),
corroborationScore: number(),                // [0,1] C — option/evidence only
// question aggregates (question nodes only):
optionCount:        number(),
leadingOptionId:    string(),
convergenceIndex:   number(),                // [0,1]
lastActivityAt:     number(),
```
Add `chat` to `SourceApp`. Rebuild `shared-types` and refresh the tarball the `functions/` workspace consumes (mirror commit `6be6b3456`; **confirm the pack step** before relying on the fields server-side).

### 1b. New package `@freedi/evidence` (pure, framework-agnostic — imported by functions *and* client; no Firebase, no AI SDK)
```
packages/evidence/src/
  types.ts              EvidenceVerdict, EvidenceScorer, IndependenceEstimator, ConvergenceMetric, taxonomy types
  registry.ts           registerScorer/getScorer, registerIndependence/getIndependence (late registration)
  taxonomy.ts + taxonomy.default.json
  independence/embeddingCluster.ts   v1 IndependenceEstimator (pure given embeddings)
  convergence.ts        v1 ConvergenceMetric (§1.5)
  corroboration.ts      the Popperian–Bayesian scorer (§1.2–1.3)
  containment.ts        allowed-edge table + cycle guard (§1.1)
  __tests__/ … , eval/ …
```
Contracts (exact interfaces from the brief — `EvidenceVerdict`/`EvidenceScorer` — plus):
```ts
export interface IndependenceEstimator {
  readonly version: string;
  estimate(input: {
    candidate: Omit<EvidenceVerdict,'independenceFactor'|'effectiveWeight'>;
    siblingVerdicts: EvidenceVerdict[];
    embeddings?: { candidate: number[]; siblings: number[][] };
  }): Promise<number>;                // independenceFactor ∈ [0,1]
}
export interface ConvergenceMetric { readonly version: string; compute(optionCs: number[]): number; }
// registry: getScorer(version?) defaults to highest registered; same for independence; listScorerVersions().
```

### 1c. `corroboration.ts` — the four seams (commented, pure)
```ts
export interface ScorableStatement {
  // id, parentId, statementType, dialecticType, vote tally (sum, N), children…
  prior?: number;           // p0_i = verdict.baseStrength. default cfg.prior (~0.5)
  confidence?: number;      // [0,1]. default 1
  effectiveWeight?: number; // [0,1] this node's weight into its parent. default 1
}
// baseCredibility (per-node prior + confidence blend; replaces flat cfg.prior):
const p0   = node.prior ?? cfg.prior;
const c    = node.confidence ?? 1;
const p0eff= c * p0 + (1 - c) * 0.5;
const kappa= node.N / (node.N + cfg.k);            // κ = N/(N+k)
const vote = node.N > 0 ? node.sum / node.N : p0eff;
const Cbase= kappa * vote + (1 - kappa) * p0eff;
// sibling noisy-OR (weight carries the independence discount; sign from edge type):
const contribution = (child.effectiveWeight ?? 1) * child.C;
// S    = 1 - Π_supporting(1 - contribution);  Aatt = 1 - Π_attacking(1 - contribution)
// DF-QuAD combine(Cbase, S, Aatt) and the bottom-up pass: UNCHANGED.
```
**Which nodes:** an `option` has no `evidenceClass` → its `Cbase` shrinks votes toward the neutral `cfg.prior`; its strengthen/critique **evidence children** carry the class priors and feed it via DF-QuAD. Evidence nodes use their verdict's prior. Questions/chatter are not scored.

### 1d. Evidence taxonomy (committed config, versioned; Firestore override `config/evidenceTaxonomy/{version}`)
```jsonc
{ "version": "tax-2026-06-07",
  "classes": {
    "anecdote":{"baseStrength":0.10,"label":"Personal testimony / anecdote"},
    "case-series":{"baseStrength":0.25,"label":"Multiple informal reports"},
    "expert-opinion":{"baseStrength":0.40,"label":"Expert opinion"},
    "observational":{"baseStrength":0.55,"label":"Observational study / survey"},
    "experiment":{"baseStrength":0.75,"label":"Controlled experiment / RCT"},
    "systematic-review":{"baseStrength":0.90,"label":"Systematic review / meta-analysis"},
    "formal-argument":{"baseStrength":0.95,"label":"Formal / deductive argument (domain-dependent)"} },
  "fallbackByPill": { "strengthen":0.20, "critique":0.20 } }
```
Defaults are a revisable convention; the calibration harness (Phase 7) re-fits `baseStrength` to human labels.

---

## Phase 2 — App scaffold, Firebase, hosting, security rules

- SvelteKit + `adapter-node`; `@freedi/*` aliases incl. **`@freedi/evidence`**; `vite.config.ts` scss `modern-compiler` (mirror `apps/flow`). Root `package.json` += `dev:chat`.
- `src/lib/server/firebaseAdmin.ts` (admin; emulator hosts in dev). `src/lib/firebaseClient.ts` — **lazy** factories: `firestore()` (public/unlisted) and `firestoreAuthed()` (private; +`firebase/auth`). Region `me-west1` for callables.
- **SSR deploy:** `adapter-node` handler wrapped in an onRequest Cloud Function `ssrChat` (me-west1); `firebase.json` hosting target `chat` (`public: apps/chat/build/client`) rewriting `**` → `ssrChat`. (Confirm vs experimental `webframeworks`; must coexist with the hand-managed multi-site `firebase.json`.)
- **`firestore.rules`** per §2; add composite index for the discovery query (`isRoot ASC, visibility ASC, lastActivityAt DESC`).
- `.env.local` from `apps/flow`.

---

## Phase 3 — Tree & read layer (`apps/chat/src/lib`)

- `containment.ts` (re-export from `@freedi/evidence`) — allowed-edge + cycle validation, used by write actions and the tree-builder.
- `server/conversation.ts` — admin subtree read with a **visibility branch**: public/unlisted read freely; private verify `locals.user ∈ memberIds` first (else 403). Returns serializable `Statement[]` incl. denormalized verdict/aggregate fields.
- `stores/messages.ts` — flat `Statement[]`; derived tree (`buildTree` two-pass) **skipping `dialecticSnapshot`**. Reads `corroborationScore`/`evidenceStatus`/aggregates straight off the denormalized fields (the heavy `corroboration.ts` pass runs server-side, never on the client).
- `realtime.ts` — `onMount` only: lazy `onSnapshot` on `where('topParentId','==',id)`; public/unlisted use `firestore()`, private use `firestoreAuthed()` (§2). Patches the store on `added/modified/removed`; resolves the "evaluating…" chip live.

---

## Phase 4 — Write actions, auth, recompute (`+page.server.ts` form actions)

### 4.1 `sendMessage` (context-aware type; never blocks on AI)
The composer sends `{ parentId, kind }` where `kind` is resolved from `parent.statementType` (§6 composer). Build with `createStatementObject`:
| composer choice (by parent) | statementType | dialecticType | scored? |
|---|---|---|---|
| under `question`: "Propose option" | `option` | — | no (gets C via votes/children) |
| under `question`/`option`/`evidence`: "Ask sub-question" | `question` | — | no |
| under `option`/`evidence`: Standard | `statement` | `standard` | no |
| under `option`/`evidence`: Strengthen | `evidence` | `strengthen` | **yes** |
| under `option`/`evidence`: Critique | `evidence` | `critique` | **yes** |

Validate the edge via `containment.ts`. Set `isRoot=false`, inherit `visibility`/`memberIds` from parent (denormalized), `replyTo` preview, `sourceApp: chat`. For evidence nodes set `relation:'neutral'`, `evidenceStatus:'pending'`. Bump `lastActivityAt` up the chain. Root creation (a new conversation) sets `isRoot=true` + chosen `visibility` (+ `memberIds` for private).

### 4.2 `evaluate`
Write ±1 evaluation doc (toggle on re-click), reusing `evaluationId = uid--statementId` semantics from `src/controllers/db/evaluation/setEvaluation.ts`. Only `option`/`evidence` are votable.

### 4.3 `generateRevision` / `acceptRevision`, membership
Invoke Phase 5 callables. `hooks.server.ts` verifies the session cookie → `locals.user`; `routes/api/session/+server.ts` mints it from a client ID token.

### 4.4 Unified ancestor recompute (`recomputeAncestors(statementId)`) — O(depth), debounced
Triggered by a new evidence verdict **or** an evaluation create (extends the existing `onCreateEvaluation` path so votes and verdicts share one routine). Walk the `parents` chain from the **nearest enclosing `option`** upward; for each ancestor:
- `option` / `evidence` → recompute `C` (`corroboration.ts` over its subtree + votes), write `corroborationScore`.
- `question` → recompute aggregates: `optionCount`, `leadingOptionId` (max-`C` option child), `convergenceIndex` (`ConvergenceMetric`).
- always → bump `lastActivityAt`.
Idempotent writes; coalesce bursts on hot nodes.

---

## Phase 5 — Cloud Functions (`functions/src`, me-west1)

### 5a. `evidenceScorerV1` (`functions/src/evidence/scorerV1.ts`)
`version='scorer-v1-gemini-<tax>'`. `score()` builds a structured Gemini prompt (reuse `services/ai-service.ts`, `config/gemini.ts`) from `{ parentText, statementText, threadContext, userPillHint }` → strict JSON `{ relation, evidenceClass, confidence, rationale, features }`. `baseStrength=taxonomy.lookup(evidenceClass)`; `independenceFactor=getIndependence().estimate(...)` (reuse embeddings from the synthesis/`twoTierJudge` path); `effectiveWeight=independenceFactor`; apply authority rule (§3). Registers itself: `registerScorer(...)`, `registerIndependence(...)`.

### 5b. `onChatStatementCreated` (Firestore `onCreate`, guarded)
Run **only on evidence edges**:
```ts
const isEvidenceEdge =
  (parent.statementType === 'option' || parent.statementType === 'evidence')
  && child.statementType === 'evidence';   // dialecticType sets the sign
```
Then: `getScorer().score()` → write verdict to **`evidenceVerdicts/{statementId}/{scorerVersion}`** (retains `features`+`rationale`); denormalize active verdict onto the statement (`relation`, `dialecticType` from relation unless low-confidence→pill, `evidenceClass`, `effectiveWeight`, `evidenceConfidence`, `activeScorerVersion`, `evidenceStatus`); then `recomputeAncestors(statementId)` (§4.4). Fallback to `user-fallback` on error. Non-evidence nodes: never AI-scored (questions/options/chatter); options still get `C` recomputed via §4.4 when their children/votes change.

### 5c. `rescoreStatement` (admin/offline callable, calibration infra)
`{ statementId, scorerVersion }` → re-run that scorer (stored `features` where possible) → write a **new** `evidenceVerdicts/.../{scorerVersion}` doc **non-destructively**; never flips the active verdict unless explicitly promoted.

### 5d. `redeemInvite` / `updateMembership` (private)
Add/remove uid in root `memberIds` + batched subtree update; token expiry/revocation.

### 5e. r1 AI engine: `generateDialecticalRevision`, `acceptDialecticalRevision`
onCall; `acceptDialecticalRevision` = transaction (snapshot child, re-parent replies, replace text, bump `versionControl`, reset eval aggregates). Mark AI-authored output for §6 SEO.

Deploy: `npm run deploy:f:test -- onChatStatementCreated rescoreStatement redeemInvite updateMembership generateDialecticalRevision acceptDialecticalRevision` (deploy scripts, `--` separator).

---

## Phase 6 — UI, screens, SEO, retention

### Screens (each SSR)
1. **`/` Discovery** *(public, no auth).* SSR list of latest public roots. Cards show `optionCount`, `leadingOptionId` preview, `convergenceIndex`, activity, creator. No per-card listeners. Query (now executable, via `isRoot`):
   ```ts
   db.collection('statements')
     .where('isRoot','==',true)
     .where('visibility','==','public')
     .orderBy('lastActivityAt','desc').limit(N)
   ```
2. **`/q/[id]` Question page** *(SSR; public/unlisted indexed-or-`noindex`; private auth-gated).* Question → options (each: `C` bar, `EvaluationBar`, evidence badge) → under each option: evidence + chatter + sub-questions. **Each `question` node is its own addressable route + its own QAPage**; sub-questions render as links to `/q/[childId]` with a breadcrumb (bounds DOM depth, clean SEO, natural Focus Mode home).
3. **`/u/[id]` Profile** *(public, SSR, `ProfilePage`)* — satisfies `author.url`; lists the creator's questions/options; (v2) evidence-quality track record.
4. **Sign-in (Google)** — lazy Firebase Auth → session cookie; **draft-preserving** (stash composer text, return pre-filled). Never gates reading.
5. **`/invite/[token]`** *(private redeem, §2).*

### Composer — context-aware (§4.1 table)
Reads `parent.statementType`: under a `question` → *Propose option* | *Ask sub-question*; under `option`/`evidence` → pills *Standard / Strengthen / Critique* + *Ask sub-question*. The pill is a hint; evidence edges are AI-authoritative per §3.

### Components
r1 set (`MessageNode` recursive, `MessageList`, `EvaluationBar`, `AiSummaryPanel`, `HistoryDrawer`, `ChatHeader`; depth-2 mobile truncation; Focus Mode; i18n via `@freedi/shared-i18n` JSON + a small Svelte `t` store) **+** evidence badge (`evidenceClass` + `effectiveWeight` + `C` bar + "evaluating…" chip) and a rationale popover ("user marked X" vs "AI: relation/class (conf)") with a **Contest** affordance. New i18n keys across all 7 language files.

### SEO / structured data (current as of the 2026-03 Google update)
- **Per question page = `QAPage`**; options = answers (`answerCount`), evidence/chatter = comments (`commentCount`).
- **`digitalSourceType`** on AI-authored content (accepted revisions v2, AiSummaryPanel summaries) = `TrainedAlgorithmicMediaDigitalSource`; human content omits it.
- **`author.url` → `ProfilePage`** (screen 3). Only **public** is eligible; unlisted `noindex`; private never served to crawlers.
- Discovery = `ItemList` of QAPages; `sitemap.xml` from public roots.

### Retention (in-app only — no notifications, no gamification)
"What changed since you left" (new evidence under backed options + `C` movement, on visit), visible Convergence Index per question, "your critique was resolved in v2" (from `acceptRevision`), a follow/watch list on `/`. v2: evidence-quality track record (not karma).

---

## Phase 7 — Verification, tests, calibration

**Build/SSR/bundle:** build `shared-types` + `evidence`; `cd apps/chat && npm run check-all`. `curl` an SSR route → full HTML, no client JS, per-question `<head>`. Confirm the initial chunk excludes Firebase and firestore is a lazy chunk; private route emits `noindex` + 403s non-members.

**Unit (vitest, `packages/evidence`):** `baseCredibility` (prior injection; `confidence→0` pulls `p0eff`→0.5; `κ` monotone in `N`); noisy-OR (`effectiveWeight` scales; `independenceFactor=0` ⇒ ~0 contribution); DF-QuAD (bounded [0,1], monotone, sign from edge); containment (allowed/illegal edges, cycle rejection); convergence v1; aggregate recompute (optionCount/leadingOption/convergence). **Property tests:** (i) one `systematic-review` ≥ any number of independent anecdotes; (ii) N duplicates (independence→0) ≈ one; (iii) adding a corroborator never lowers C, a falsifier never raises it.

**Offline eval/calibration (`packages/evidence/eval/`):** replay stored `features` against a new scorer → relation/class confusion + confidence calibration (ECE) vs human labels; A/B v_new vs v_old; re-fit taxonomy `baseStrength` (isotonic/logistic) → new taxonomy version.

**E2E (emulator):** post Strengthen/Critique → async verdict lands, `dialecticType`/`effectiveWeight` set, chip resolves, nearest option `C` + ancestor question aggregates update O(depth). Disable JS → SSR + form post still work. Force scorer error → write succeeds with `user-fallback`. Private: non-member blocked at SSR; member gets authed live updates. Propose-option / ask-sub-question create correct types and are not AI-scored.

---

## Implementation status — built & verified

Phases 1–7 are implemented end-to-end (SvelteKit `apps/chat` + `@freedi/evidence` package + chat Cloud Functions), plus the UX/feature work below. Everything below is verified against the local Firebase emulators (Playwright-driven). Commits land on the `chat-app` branch.

### Evaluation UX — the rating controls (per node type)
Both controls are **two-state** (a compact closed indicator that expands on click) and post a **continuous** value to the existing `evaluate` action (works without JS; `use:enhance` smooths it). The corroboration scorer reads votes via `(e+1)/2`.

- **Option** → `EvaluationBar` (5-emoji face rater 😡😕😐🙂😍 → `-1/-0.5/0/0.5/1`).
  - **Closed indicator shows three aggregate values:** `consensus C%` (corroboration level, colored by level) · `# evaluators` · `avg vote` (raw mean, colored by sign). No votes yet → `consensus C% · ☆ Vote`.
- **Evidence (strengthen/critique)** → `CorrectnessRating` — a **bipolar epistemic slider** "I think it's incorrect ← unsure → I think it's correct", continuous `[-1,1]`, pointer-drag + keyboard (arrows/Home/End/0). Ported/restyled from the user's React prototype to the dark-glass theme (gradient `--critique → muted → --strengthen`).
  - **Closed indicator shows the corroboration level** `⚖️ Cr C%` (NOT raw consensus), colored by level, with the rater count; click expands to the slider.
- The standalone `CorroborationBar` is **removed from message nodes** — the corroboration level now lives in each node's closed rating indicator. (`ConvergenceMeter` still used on discovery cards + question header.)
- **Denormalized aggregates:** `recomputeAncestors` now also writes each scored node's raw `evaluationAverage` (`[-1,1]`) + `evaluationCount` alongside `corroborationScore`; the closed indicators read these (via a narrow cast in `evalStatsOf()`; no shared-schema change). Realtime delivers updates live after a vote.

### AI thread summary + revision (real Gemini, whole subtree)
- `generateDialecticalRevision` reads the **entire subtree** (every descendant via `parents array-contains`), builds an indented, type/polarity/C-labelled digest of **all sub-statements** (capped 200), and asks Gemini for a thread summary + a revised claim addressing the strongest critiques. Returns `descendantCount`.
- **Change-detection cache:** a `subtreeFingerprint` (count + hash of every live descendant's `id:lastUpdate`) is stored on the revision doc. A repeat request with an unchanged subtree returns the **cached** summary (`cached:true`) without calling Gemini; any add/remove/edit/re-score flips the hash → regenerate. UI shows "✓ up to date" when cached.
- **UI = the reference `.summary-node` callout** (✨ icon column + "AI Thread Summary" + amber "Suggested Revision" with Accept). The **"✨ AI Summary / Hide Summary" toggle lives in the message action row next to Reply/Collapse**; the box opens **inside the message content** (after the bubble). Loads/opens in **one smooth step** (the wait shows on the button; the box only mounts once loaded — no two-step jump). Cached re-opens are instant.

### Look & feel (adapted from `/Documents/chat-tests`)
- **Dark-first glassmorphism** design system (`styles/tokens.scss`, `_mixins.scss`): Outfit type, indigo→purple accent gradient, green/magenta dialectic pills with glow, glass panels, custom scrollbar.
- **Manual dark/light theme toggle** (☀️/🌙) in the header, persisted to `localStorage` (`data-theme`), on top of `prefers-color-scheme` default.
- **Conversation card chrome** on `/q/[id]` — one floating glass panel: header → darker inset thread area → footer composer (reference `chat-container`).
- **Recursive message UI** with chat bubbles + tails, **solid-green Strengthen / dashed-pink Critique** evidence bubbles, clickable vertical thread lines, evidence badges, depth-2 truncation → focus link.
- **Auth header** (sticky): brand, "Start a question", and either **Sign in** or the signed-in user (avatar + name → profile) + **Sign out** (clears client Auth SDK *and* server session cookie). `+layout.server.ts` exposes `locals.user`.

### Animations
- Custom `slideFade` transition (`lib/transitions.ts`, height+opacity, cubicOut) for collapse/expand of thread children, the reply composer, and the AI panel. Fixed two bugs: (a) `transition:…|local` suppressed by ancestor `{#if}` nesting (hoisted to derived flags); (b) competing per-node CSS entrance animation removed. Reduced-motion handled globally.

### Infra / fixes landed this session
- **Realtime against the emulator:** client Firestore uses `experimentalForceLongPolling` + connects on `127.0.0.1` (not `localhost`, which resolves to IPv6); `isLocalhost()` matches `localhost`/`127.0.0.1`/`::1`. Fixes the "could not reach backend / offline" listener failure.
- **Callable auth:** `functionsClient()` initializes Auth and awaits `authStateReady()` so callables attach the ID token (fixes AI-summary 401); targets the **functions emulator (127.0.0.1:5001)** on localhost, me-west1 in prod. `currentUser()` / `signOutEverywhere()` helpers.
- **`sendMessage` 400 fix:** removed a broken cycle guard (`assertNoCycle(parentId, [...parents, parentId])` always tripped); a new child has a fresh id so no cycle is possible. Composer now `use:enhance` (posts in place, clears the box, clean URL).
- **SSR robustness:** every admin read in `conversation.ts` is bounded by an 8 s timeout so an unreachable/hung Firestore renders gracefully instead of hanging the server. Non-POJO Firestore values (Timestamps → millis, `embedding` VectorValue dropped) are serialized for SvelteKit.
- **Root creation UI:** `/new` route + `createRootQuestion()` (a `question` with `isRoot`, chosen visibility); "Start a question" CTA.

### Seeds
- `npm run seed:chat` (one sample conversation) and `npm run seed:chat:large` (a **public ~20-message** debate: 4 ranked options, strengthen/critique evidence incl. nested, comments, a sub-question) — `apps/chat/scripts/seed{,20}.cjs`. Both require `FIRESTORE_EMULATOR_HOST`.

### Deviations from the spec (decided in implementation)
- **`firestore.rules` statements read left unchanged** (`allow read;`, world-readable) — it's shared by 4 other production apps; tightening it would break them. Private-tier enforcement is **server-side** via the SSR `memberIds` gate (the open-problem path). Discovery/profile composite indexes were added.
- **`evaluationAverage`/`evaluationCount` are not in the shared valibot schema** — written by functions (admin, schemaless), read in the app via a narrow cast. Avoids a shared-types rebuild/repack for two display-only fields.
- **`apps/flow` is Vite+Mithril, not SvelteKit**, and the repo had no SSR-via-function precedent — the SvelteKit scaffold + `ssrChat` onRequest wrapper are net-new (the `ssrChat` handler is loaded at runtime from `functions/chat-build/`, copied at deploy).

---

## Critical files
**Modify:** `shared-types` `TypeEnums.ts` (+`DialogicType`,`EvidenceRelation`,`EvidenceStatus`,`Visibility`,`StatementType.evidence`,`SourceApp.chat`), `StatementTypes.ts` (fields §1a); root `package.json`; `firebase.json` (+`chat` target); `firestore.rules` + indexes; `functions/src/index.ts`; extend the `onCreateEvaluation` recompute path; `packages/shared-i18n/src/languages/*.json`.
**Create:** `packages/evidence/**` (`types.ts`, `registry.ts`, `taxonomy.*`, `independence/embeddingCluster.ts`, `convergence.ts`, `corroboration.ts`, `containment.ts`, tests, `eval/`); the `apps/chat/` SvelteKit tree (`svelte.config.js`, `vite.config.ts`, `routes/+page.server.ts`, `routes/q/[id]/{+page.svelte,+page.server.ts}`, `routes/u/[id]/+page.svelte`, `routes/invite/[token]/`, `routes/api/session/+server.ts`, `hooks.server.ts`, `lib/server/{firebaseAdmin,conversation}.ts`, `lib/{firebaseClient,realtime,containment}.ts`, `lib/stores/messages.ts`, `lib/seo/structuredData.ts`, `sitemap` route, components, `styles/tokens.scss`); `functions/src/evidence/scorerV1.ts`, `fn_onChatStatementCreated.ts`, `fn_rescoreStatement.ts`, `fn_redeemInvite.ts`, `fn_updateMembership.ts`, `fn_generateDialecticalRevision.ts`, `fn_acceptDialecticalRevision.ts`; `ssrChat` wrapper.
**Also created (implementation):** `apps/chat/src/lib/components/{MessageNode,Composer,EvaluationBar,CorrectnessRating,AiSummaryPanel,EvidenceBadge,CorroborationBar,ConvergenceMeter}.svelte`; `lib/{transitions,aiSummary,i18n,firebaseClient,realtime,containment}.ts`; `lib/chat/node.ts`; `lib/server/{firebaseAdmin,conversation,writeActions}.ts`; `routes/{+layout.svelte,+layout.server.ts,new,signin,invite/[token],api/session,sitemap.xml}`; `styles/{tokens,mixins,global}.scss`. Functions chat dir: `functions/src/chat/{recomputeAncestors,scorerV1,fn_onChatStatementCreated,fn_onChatEvaluationCreated,fn_rescoreStatement,fn_invite,fn_dialecticalRevision,ssrChat}.ts`. Seeds: `apps/chat/scripts/seed{,20}.cjs` (+ root `seed:chat` / `seed:chat:large` scripts).
**Reuse:** `createStatementObject()`; evaluation + `onCreateEvaluation`; Gemini service; `twoTierJudge` embeddings; `fn_summarizeDiscussion.ts` (onCall template); `statementEvaluationUpdater.ts` (transaction/recompute template); `apps/flow` (Vite/scss/firebase template); `@freedi/shared-i18n`.

---

## Open problems
- **Independence estimation quality** — embedding clustering is brittle; paraphrase/cross-thread duplication evades; threshold tuning trades false-merge vs missed-duplicate. Primary defense seam; will be replaced.
- **Gaming** — sockpuppet brigading (volume≠evidence, only as strong as independence est.); fabricated/spoofed citations inflating `evidenceClass`; prompt injection in statement text; class-inflation. Needs source verification + injection-resistant prompts + rate/identity signals.
- **Public creation = spam surface** — anyone opens a public question; needs rate-limiting + a threshold before a new question lists in discovery.
- **Private membership scaling** — `memberIds` denormalization vs root-`get()`; subtree rewrite cost on change; large trees. Mixed-visibility subtrees deliberately out of scope.
- **Invite-token security** — expiry, revocation, role escalation, link leakage.
- **Taxonomy disputes** — `formal-argument 0.95` is domain-dependent; who edits; historical re-derivation on version bump.
- **AI error modes** — hallucinated class, miscalibrated confidence, RTL/multilingual coverage, sarcasm, falsify-vs-neutral boundary. Bounded by `τ_conf` + fallback; measured by calibration.
- **Authority conflicts & appeals** — Contest needs a real dispute/override/audit workflow.
- **Recompute storms** — hot ancestors; votes + verdicts both trigger; O(depth) + debounce/coalesce + idempotency.
- **Deep recursion UX** — crawl/DOM cost of deep question nesting; pagination/collapse policy (cycles already prevented).
- **Convergence metric** — v1 leader-gap proxy is a placeholder for the user's research metric (pluggable via `ConvergenceMetric`).

---

## Revision history & reconciliations
- **r1** SvelteKit + SSR + lazy realtime + reused FreeDi backend. **r2** `EvidenceScorer` + `corroboration.ts` integration, taxonomy, async pipeline, auditability. **r3** tree model, three-tier visibility, discovery/SEO, retention. **This doc** consolidates all three into one executable spec.
- **r4 (build session)** — Phases 1–7 implemented + UX/feature layer (see **Implementation status**): two-state rating controls (option = consensus · #evaluators · avg vote; evidence = bipolar correctness slider with closed `Cr` indicator), whole-subtree **cached** AI summary rendered in the reference `.summary-node` callout placed in the message action row (single smooth open), reference glassmorphism + dark/light theme toggle + conversation-card chrome + auth header, `slideFade` collapse/expand, emulator realtime + callable-auth + `sendMessage` fixes, and seed scripts.
- **Reconciliations applied in consolidation** (from the review): (1) unified `statementType` model — chatter = `StatementType.statement` (label "Standard"), `evidence` is a first-class type, composer sets the type, `sendMessage` no longer hardcodes `statement`; dropped legacy `group`. (2) Question aggregates now produced by the unified `recomputeAncestors` pass (§4.4). (3) `convergenceIndex` defined as a pluggable `ConvergenceMetric` with a v1 leader-gap proxy (§1.5). (4) Discovery query made executable via a stored `isRoot` flag + composite index. (5) Private realtime auth reconciled — public/unlisted listeners need no auth SDK; private listeners reuse the persisted client sign-in (or a custom token), first paint still Firebase-free (§2). (6) Removed `group`; `containment.ts` is Create-only; composer/world-readable text corrected in place.
