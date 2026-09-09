# Question → proposals → maps → agreements → decision

Implemented in `codex/main-app-playful`, September 9, 2026. This specification supersedes the earlier 80% / non-objection review experiment.

## The participant journey

A conversation starts with a question. Its common-ground view offers **Add a solution** followed by **Invite people to participate**. Questions still contain solutions and recursive sub-questions; Maps retains the original mind-map, clustering and other map views, with themes and synthesis under Maps.

The existing `isChosen` result, computed by the app's cutoff mechanism, selects source proposals. We do not replace that calculation with a second ranking. Hidden and integrated originals are excluded; selected synthesis statements remain eligible.

The facilitator can update the summary or generate a document. New questions opt into automation. Existing questions have an explicit automation switch. A scheduled worker runs every 15 minutes. It generates an agreement when every selected proposal has evaluators and Cp ≥ 0.70; this is the working interpretation of the automatic trigger. Summary generation is independently limited to every 24 hours and only runs when selected source wording or composition has changed. Score changes alone do not rewrite a summary. Generation is serialized, retried on failure and deduplicated by source content.

The generated document is a real `Statement` with `statementType: agreement`, `isDocument: true` and `parentId` equal to the question. It has canonical paragraph statements, so Sign's existing document editor, paragraph review and suggestions remain available. The main app displays its introduction, Cp and evaluator count, with a button into Sign. Sign links back to the question. The cross-origin handoff uses an authenticated, document-bound, single-use code valid for 60 seconds; Firebase tokens are never placed in URLs.

## Agreement and exact wording

In Sign, participants read the document and then support, remain neutral or oppose its exact wording. Agreement documents use this version-bound Cp control instead of the legacy unversioned whole-document signature footer. Ordinary Sign documents retain their existing signature workflow. The existing shared `calcAgreement` formula calculates Cp; **Cp ≥ 0.70** establishes agreement, independently for every document. This can include opposition. It is not a raw percentage of positive responses, and silence is not a response.

A wording hash covers the title and ordered canonical paragraphs. Each response is keyed by document, hash and user; the evaluated text is archived. Editing the document makes the current rating count start from zero. Earlier responses are retained against the earlier wording. Ratings cannot be transferred to new wording by an administrator or AI.

## Versions and alternatives

Any participating member can submit a question/disagreement and a bundle of paragraph replacements. Sign shows the bundle to the facilitator, who can create:

- **New version**: an improvement in the same document family.
- **Alternative wording**: a separate path with a new family and a link to its source document.

Untouched paragraphs are copied exactly. Every new document starts without evaluations. Stale change bundles cannot be applied after their source text changes. Subsequent AI drafts from changed source proposals are versions of the previous generated family. AI does not automatically invent alternatives or treat synthesis as resolution of a substantive disagreement.

For the legislative example, shared constitutional provisions stay identical while the disputed legislative-authority clauses can branch into committee-led and direct-democracy alternatives. Participants can evaluate each independently; several alternatives can pass the agreement threshold.

## Choosing one path

Passing Cp establishes agreement with a wording; it does not select the single path a movement will implement. Where local autonomy permits different paths, the alternatives can coexist. This release does not create or reorganize local groups or assign them documents automatically.

When one decision is needed, the facilitator selects two or more agreements and opens the existing **Vote** interface. Its options contain frozen document texts and hashes. Client rules prevent rewriting or deleting these ballot snapshots. The facilitator can close the vote and record the unique leading option. Empty ballots and ties require further deliberation or voting. Finalization reads the actual vote records, records the chosen document/hash separately from Cp, and closes the ballot to further vote writes. This follows Vote's existing one-choice plurality behavior; it does not invent a different election method or a quorum.

## Runtime and data

- Server: `functions/src/deliberation/` (callable, source triggers, scheduler, handoff).
- Main UI: `ThinkingSpace/QuestionProcess.tsx`.
- Sign UI: `apps/sign/src/components/document/AgreementJourney.tsx`.
- Shared model: `packages/shared-types/src/models/covenant/deliberation.ts`.
- Server-owned collections: `questionDeliberations` (ratings, wording snapshots, source records, proposed changes and ballot results), `agreementHandoffs`.
- Existing `covenantWorkflows` data and service remain available for compatibility; they are not silently migrated or counted in the new agreement process.

Generation requires `OPENAI_API_KEY`. The default agreement model is `gpt-6-astra`, overridable with `OPENAI_AGREEMENT_MODEL`, using high reasoning effort. This choice follows the [official GPT-6 Astra model documentation](https://developers.openai.com/api/docs/models/gpt-6-astra). Summary generation uses the project's existing fast-model setting. Missing configuration causes a visible error; no fixture document is substituted in real generation.

Deploying the feature requires the new callable functions, Firestore trigger, scheduler, security rules and `questionDeliberations` queue index together. Configure `VITE_SIGN_APP_URL`, `NEXT_PUBLIC_MAIN_APP_URL` and, where necessary, `NEXT_PUBLIC_DELIBERATION_FUNCTIONS_URL`. Production defaults are `https://sign.wizcol.com` and `https://app.wizcol.com`; deployments using other domains must override these and include their origins in CORS. Expired one-time handoff records should be cleaned up under the deployment's retention policy.

## Local verification

Use the isolated `demo-freedi-redesign` namespace. Main app runs on localhost:5189; Sign on localhost:3012; callable gateway on localhost:5309; Auth on 9399; Firestore on 8081.

- `npm run dev:redesign`
- `npm run dev:redesign:sign`
- `npm run dev:redesign:functions`
- Compile functions, then `npm run test:deliberation` for emulator integration checks. AI is explicitly stubbed in this test only.
- `node --test tests/rules/deliberation.test.mjs tests/rules/votes.test.mjs` checks frozen ballots and authorization.
- `node scripts/verify-deliberation-browser.cjs process-<fixture-id>` checks authenticated Sign handoff, rating, return navigation, Hebrew and mobile layout. Use the fixture id printed by the integration test.

The lightweight HTTP gateway does **not** run Firestore triggers or scheduled jobs. Live automation requires the full Firebase runtime; local tests invoke the service directly. No production deployment or real model call was performed during development.
