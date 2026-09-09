# Redesign correction: from deliberation to an אמנה

Status: implemented interactive preview, main-app integration and shared covenant review service. Supersedes the conversation-first workflow in the initial Thinking Space design while preserving the accepted playful visual language.

## Purpose

Help a community discover broadly agreeable options, improve them by working through concerns, compose a concrete covenant, review its wording, and explicitly take positions on the final version. The unit of success is an increasingly acceptable, grounded agreement, not message volume or votes collected.

## Sources reviewed

- Tal Yaron, On Deliberation — Interior Proof (6x9) v2.pdf, Drive file 1VFcRrajQE9eZ5HmzWBYIQRGIo06xe1M4. Relevant sections: chapter 7 (confidence-adjusted ranking, fair sampling, clustering versus synthesis, maps, assisted drafting, convergence, thresholds); chapter 9 (recursive deliberation and summaries); chapter 11 pp. 202–204 (MassConsensus → Sign and comment/improve → consolidate → sign sequence).
- Supplied local Interior Proof PDF, including visual inspection of pp. 203–204.
- Existing implementation: consensus utilities and option sorting; synthesis controller; SwitchScreen map routes; multi-stage question summaries; apps/sign document views, comments, versions, and signatures.

## Principal correction

The current Thinking Space sideboard sorts by creation time and shows mean sentiment. It is a recent-ideas feed, not a discovery tool for broad agreement. Chat is currently the dominant entry point. The draft covenant and the work needed to reach it are absent from the preview.

## Information architecture

Default entry: Agreement overview. Persistent phase indicator: Explore → Improve → Draft → Review & adopt. These stages describe the process; they do not prohibit revisiting an earlier question. Opening the adoption phase is an authorized process transition, not something implied by a high score.

Primary destinations:

1. Overview — what is broadly supported, where opposition remains, what needs more evaluation, current covenant version, and next useful contribution.
2. Options — ranked by the existing confidence-adjusted consensus measure when results are visible. Alternate modes: needs evaluation, concerns to work through, new, and themes. Preserve fair backend sampling for evaluation; do not substitute ranking for a fair evaluation queue.
3. Conversation — dialogue attached to the relevant question, option, concern, or clause, alongside a general discussion.
4. Covenant / אמנה — the actual evolving document, initially an explicitly empty draft. Each clause links to its source options, rationale, open concerns, revisions and evaluation evidence.
5. Summary — established common ground, remaining disagreements, unresolved factual questions, and decisions. Link claims to sources; mark generation time and outdated summaries.
6. Maps — separate views for question/argument structure and agreement/polarization. Preserve existing map capabilities; do not relabel a topic layout as an opinion-group map. No invented map coordinates or cross-group support metrics where data are unavailable.

## Option workspace

Show the authored text and version, consensus score distinctly from raw sentiment, evaluator count and uncertainty, and the distribution of expressed positions where actual data support it. Missing counts remain unknown. Opposition is visible even when the aggregate is high.

Actions: evaluate independently; explain a concern; propose an improved wording; compare revisions; explore source arguments/subquestions; propose inclusion in the covenant.

Concerns link to proposed amendments. A participant can report whether an amendment addresses their concern. A facilitator or AI cannot silently convert a person's objection into consent.

Substantive revisions are new propositions for judgment. Historical ratings remain attached to their version. Show previous support as historical, never automatically endorse new meaning on behalf of previous evaluators.

## Three distinct operations

- Cluster by theme: a navigable folder of related but distinct positions. Keep the originals accessible; a theme is not a collective assertion of agreement.
- Synthesize equivalent proposals: use the existing stance-aware mechanism, preserve source texts and evaluation provenance, count each person once according to the established aggregation rules. Provide source/audit access and existing authorized correction controls. Ambiguous or opposing propositions stay separate.
- Draft a bridging proposal/covenant clause: compose new wording responding to different needs. This is a new draft for human evaluation, not an equivalence merge. Do not transfer source support as if the new wording had been approved.

## Covenant lifecycle

Draft clauses from selected proposals → collect clause-level comments and amendments → show proposed changes and their reasons → consolidate a version → open explicit review/adoption → preserve an exportable version and its decision record.

Do not ask people to sign while the same document is still being silently rewritten. An amendment after adoption produces a new version and a visible renewed review requirement. Preserve the original signed record.

Final positions must distinguish endorsement, explicit non-objection, objection, and not yet responded. Reading or silence is not non-objection. The user’s requested target is broad endorsement with the remaining participants not objecting. The book's working threshold is 80% net support and can include opposition; these are different criteria. Make the agreed process rule visible and configurable rather than assuming they are interchangeable. Do not introduce a universal veto rule from the book or silently impose its threshold.

## Example journey (illustrative, not real participant data)

A courtyard garden attracts support but raises maintenance concerns. The concern opens an improvement discussion. A participant proposes a one-month trial with named volunteers and a spending cap. The revised proposal is evaluated as a new version. If it meets the community's agreed criteria, it becomes a draft covenant clause. Residents review the exact clause, resolve wording concerns, then take positions on the consolidated document. The final record states what was approved, which version, participation and expressed opposition, responsible people, and a review date.

## Integration priorities

1. Replace the recent-idea sideboard with an agreement overview grounded in existing ranking and visibility permissions; make covenant, summary and maps discoverable.
2. Expose existing theme/synthesis views with provenance; connect option concerns and revisions to the improvement loop.
3. Reuse and connect Sign's document, paragraph interactions and versioning rather than inventing a disconnected demo editor. Audit identity, permissions, data ownership and version semantics before integrating writes.
4. Implement explicit review/adoption transitions and non-objection state if missing. The shared signature enum currently has signed/rejected/viewed, so non-objection cannot be inferred from it.
5. Validate end-to-end: new idea → fair evaluation → concern → revised option → draft clause → amendment review → version-specific positions → export. Also test hidden results, missing evidence, RTL, mobile, and keyboard access.

## Visual direction

Keep the joyful palette and friendly illustrations. Use delight to encourage contribution and learning. Do not reward agreeing over objecting, depict dissenters as obstacles, or celebrate convergence unless the evidence and process state warrant it. Make the covenant's progress visible through concrete completed work rather than a fabricated completion percentage.

## Implementation delivered in this worktree

- The preview at `/redesign.html` now opens on Common ground and includes the option → concern → revision → clause → amendment → review-version → explicit position → simulated adoption → export journey. The example computes rankings with `calcAgreement`, keeps one evaluation per example participant, and retains old versions without carrying their positions forward. It has themes with inspectable synthesis sources, a dynamic summary and five map views. Example data reset on refresh and are clearly labelled; exported files state that they are not community-approved documents.
- The actual `src` app has agreement overview, themes/synthesis, covenant, summary and maps tabs. Existing question types and evaluation pages remain available. New question entry defaults to the overview unless a saved default is present.
- The real overview uses existing condensation visibility and consensus scores, preserves hidden-result ordering, distinguishes unavailable opposition counts, and loads older options through the existing bulk loader. An incomplete load is labelled as such.
- Facilitators can assemble options into a new shared draft with paragraph-level source IDs and no copied votes. The optional `isCovenantDraft` marker preserves discovery on reload without making the draft immediately signable. Existing routing takes the draft onward to document tools. Option improvements likewise create fresh options with source IDs.
- Summary generation/editing, synthesis operations, and the real mind map, sub-question map, agreement map and polarization views use the existing services/routes and permissions. Synthesis controls mount on demand.

### Shared covenant workflow

The real question workspace now includes a persistent covenant editor backed by the authenticated `covenantWorkflow` callable. Facilitators select source solutions, amend clauses with reasons, accept participant suggestions and choose a review group explicitly. Source evaluations never become document endorsements.

Each review freezes its title, clauses, source wording, roster and endorsement threshold. Named reviewers record endorsement, non-objection or an objection with a reason. Adoption requires responses from the entire chosen roster, zero objections and the configured 51–100% endorsement threshold. This is agreement among that named review group; it does not claim to represent people outside the roster. Reopening creates a draft; its next review starts with fresh responses and retains the prior record. Markdown exports include wording, provenance, review rule, responses and adoption details.

The server enforces active membership, facilitator authority, note ownership, current revision, current review version and paused/expired decisions. Firestore transactions reject stale concurrent edits. Direct client access to `covenantWorkflows` is denied. Limits are 40 clauses, 200 notes, 500 reviewers and 100 review versions per question.

Existing Sign tools remain accessible under “Other document drafts and Sign tools”. This does not migrate existing signatures into the new review service. No production data or deployment was changed.

### Verification

- Seventeen focused unit tests cover confidence-adjusted ranking, hidden-result ordering, unavailable opposition data, replacement evaluations, fresh revisions, immutable review snapshots, empty-review rejection and ownership of concern resolution.
- The browser test in `scripts/verify-agreement-workflow.cjs` exercises the full example path, export, synthesis sources, summaries, maps, mobile, and dark RTL.
- Production build, TypeScript and changed-component lint checks were run.
- Live smoke checks use only the isolated `demo-freedi-redesign` Firebase emulator namespace. AI generation and clustering callables are not simulated as completed results; their local availability is separately reported.

## Public landing page

The public `/` and `/start` entry now explain Freedi’s purpose and the four-step agreement journey in the shared pastel visual language. Login uses the existing Google and temporary-name flows; authenticated visitors return to `/home` or their saved invitation destination. Existing workspace routes remain unchanged. The standalone `/redesign.html` opens the same landing page with an explicitly labelled example entry; `?view=courtyard` opens the example directly. Landing copy is translated in all seven supported languages.

Verified desktop/mobile layouts, scroll access to all sections, keyboard dismissal of login, temporary-name form access, authenticated redirects, and return visits against the isolated demo emulator.

## Recursive question correction

A conversation begins with a question. Every question exposes candidate solutions and direct sub-questions; opening a sub-question repeats the same process. The preview preserves each question’s evaluations, clauses and review snapshots when navigating through breadcrumbs. New root questions and arbitrarily nested sub-questions start empty. Child support is never copied to the parent. Findings must be used to improve and evaluate the parent answer.

The live overview displays actual `parentId` relationships, question-specific solution ranking, and links to child question workspaces and the existing question creation/list interface. Synthesis themes remain a separate grouping dimension; they are not substituted for the question hierarchy.

## Map navigation

All five maps share the same question scope and a three-part navigation: Structure (mind map, sub-question map), Solutions (topic/synthesis board), Agreement (triangle, polarization). The live map routes render the original components, including the formerly separate cluster board, with return links to the question and map index. Existing editing and data permissions remain in those components; hidden-result questions do not mount agreement or polarization views.

The standalone example provides five interactive map representations using local question and evaluation data. Its triangle uses positive/negative rating weights normalized by the maximum evaluation count, without the original random jitter. Polarization uses mean and mean absolute deviation. Unrated solutions are listed separately. These example views do not implement the original demographic filters, hex aggregation, drag editing, or all canvas controls; those remain available through the real app’s original components.

## Running the full app locally

Worktree: `../Freedi-app.worktrees/main-app-playful`, branch `codex/main-app-playful`.

The complete app is at `http://localhost:5189/`. The design-only example remains at port 5187. The app uses the isolated `demo-freedi-redesign` namespace. The local commands require existing Firestore (8081) and Storage (9199) emulators and installed app/functions dependencies.

Run in separate terminals:

```sh
npm run dev:redesign:auth
npm run dev:redesign:functions
npm run dev:redesign
```

`npm run seed:redesign` creates fictional courtyard fixtures and a test identity, preserving an existing question's edits. The browser test uses that identity through ordinary Firebase password authentication; it does not intercept or replace authentication responses. Normal visitors can use the landing page's existing temporary-name login and start their own question.

The local HTTP/callable gateway binds only to loopback and refuses non-demo project IDs. It runs actual compiled Firebase handlers, including the covenant workflow and bulk loads. It does **not** emulate Firestore background triggers; use the normal Firebase Functions emulator/deployment for background synthesis jobs and evaluation aggregates. AI operations still need their existing provider configuration. They are connected, but fresh AI generation has not been verified in this local setup.

Validation commands:

```sh
npm run build
./node_modules/.bin/tsc -p functions/tsconfig.json
npm run test:covenant
node scripts/verify-covenant-browser.cjs
./node_modules/.bin/jest --watchman=false --runInBand src/view/components/atomic/organisms/ThinkingSpace/__tests__ src/view/pages/redesignPreview/__tests__
```

The service test covers membership, facilitator gates, amendment ownership, missing responses, blocking objections, adoption, preserved prior versions and concurrent stale writes. Browser checks cover ordinary demo login, clause creation, amendment acceptance, review, position, adoption, reload, export, mobile overflow and Hebrew rendering.
