# Synthesis: Living-Only Architecture — Implementation Plan

**Owner:** Tal
**Status:** Approved design, ready to implement
**Estimated effort:** One engineer, ~1 week
**Supersedes:** the shard/fanout proposal in `plans/synthesis-100k-living-synth.md`

---

## 0. TL;DR

We are replacing the "synthesis run" — the batch operation that judges all candidate pairs in one shot and times out at 540 s — with a **living + admin-initiated** model. Synthesis is an invariant the database maintains continuously: every option, when it crosses an admin-set engagement threshold, gets exactly one trip through a small pipeline that decides whether it joins an existing cluster, seeds a new one, or sits in a gray band for admin review.

On top of the living pipeline, admins have three explicit actions:

- **Synthesize** — process every eligible option under this question now.
- **Synthesize selected** — pick specific options (checkboxes) and force-process them through the same pipeline, bypassing the engagement threshold. Useful for surfacing admin-curated options.
- **Re-judge gray-band pairs** — walk medoid pairs of existing clusters and merge any that drifted into semantic equivalence.

All four entry points (the two automatic triggers + the three admin callables) flow into **one pipeline function** that holds the decision tree. One brain, multiple hands.

Background work is allowed to take up to an hour. Each scheduled tick processes ~50 items and stops well inside the 540 s ceiling. The queue is just a Firestore subcollection; the worker is just a `pubsub.schedule` function. Admins can pause / resume / cancel any in-flight run from the UI. No shards, no fan-out, no reducers, no parallelism machinery.

---

## 1. The product change

### Today
- A callable (`synthesizeIdeasPreview`) loads all eligible options under a question, runs vector search per option, judges candidate pairs with Gemini, clusters with union-find or HDBSCAN, then writes proposals.
- All work happens inside one HTTP request capped at 540 s.
- Fails at ~90 options on the legacy path (incident). Even on the bulk path, 100k options would exhaust the gateway.

### After
- No callable for "preview synthesis." The synthesis state is always live.
- An admin opens a question, sees the current cluster view, can tune four knobs (see §3) at any time, and the system converges over the next minutes-to-hours through background processing.
- A one-time **bootstrap** operation exists for questions with a backlog of pre-existing options. It enqueues those options into the same background worker. Allowed to take up to an hour.
- A one-shot **gray-band re-judge** admin button enqueues medoid-pair re-judgments into the same queue.

### What this means for users
- Admins lose the "click to synthesize" moment. They gain a continuously-correct cluster view that updates as new options arrive.
- No more spinners that hang at 540 s.
- Cost is bounded by the admin's threshold knobs, not by dataset size.

---

## 2. Architecture in one picture

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  Option created    Option evaluated     Admin clicks "bootstrap"    │
│       │                  │                       │                  │
│       │                  │                       ▼                  │
│       │                  │            ┌──────────────────────┐      │
│       │                  │            │  Enqueue eligible    │      │
│       │                  │            │  options to queue    │      │
│       │                  │            └──────────────┬───────┘      │
│       │                  │                           │              │
│       ▼                  ▼                           ▼              │
│  ┌─────────────┐   ┌─────────────┐         ┌──────────────────┐    │
│  │ onCreate    │   │ onEvalChange│         │ synthesisQueue/  │    │
│  │ trigger     │   │ trigger     │         │   {questionId}/  │    │
│  │ (existing)  │   │ (NEW)       │         │     items/...    │    │
│  └──────┬──────┘   └──────┬──────┘         └────────┬─────────┘    │
│         │                 │                         │              │
│         │                 │                         ▼              │
│         │                 │              ┌──────────────────────┐  │
│         │                 │              │ pubsub.schedule      │  │
│         │                 │              │ every 1 min, take 50 │  │
│         │                 │              │ (NEW)                │  │
│         │                 │              └────────┬─────────────┘  │
│         │                 │                       │                │
│         └─────────────────┴───────────────────────┘                │
│                           │                                        │
│                           ▼                                        │
│         ┌────────────────────────────────────────┐                 │
│         │   runSinglePipeline(optionId)          │                 │
│         │                                        │                 │
│         │   1. Load option + settings + parent   │                 │
│         │   2. Check synthesis.enabled           │                 │
│         │   3. Check minEvaluators, minConsensus │                 │
│         │   4. Ensure embedding                  │                 │
│         │   5. findNearest cluster medoid        │                 │
│         │   6. Decision tree:                    │                 │
│         │      cosine ≥ attachThreshold → attach │                 │
│         │      cosine in gray band  → 1 LLM call │                 │
│         │      cosine < lowerBound  → seed       │                 │
│         │                                        │                 │
│         │   (NEW — single shared function)       │                 │
│         └────────────────────────────────────────┘                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Total LLM calls across a question's lifetime:** ≤ 1 per option that ever crosses the threshold. For 100k options at a 10% threshold-crossing rate, that is ~10,000 LLM calls *spread over the lifetime of the discussion*, not in a single burst.

---

## 3. Settings model (the four admin knobs)

Settings live on the **question Statement document**, under `statementSettings.synthesis`. The existing `liveSynthEnabled` field on the same doc is kept as a deprecated alias of `enabled`, read for one release cycle then deleted.

### Shape

```typescript
// Add to delib-npm or local types
export interface SynthesisSettings {
	enabled: boolean;
	minEvaluators: number;        // knob 1 — default 3
	minConsensus: number;         // knob 2 — default 0.0
	attachThreshold: number;      // knob 3 — default 0.95
	reviewLowerBound: number;     // knob 4 — default 0.85
}

// On Statement.statementSettings:
statementSettings?: {
	synthesis?: SynthesisSettings;
	// ... other settings
}
```

### Defaults

When `statementSettings.synthesis` is missing, the system falls back to:

```typescript
const DEFAULT_SYNTHESIS_SETTINGS: SynthesisSettings = {
	enabled: false,                  // OFF by default for non-MC questions
	minEvaluators: 3,
	minConsensus: 0.0,
	attachThreshold: 0.95,
	reviewLowerBound: 0.85,
};

// For Mass-Consensus questions: enabled defaults to true.
// The existing featureGate logic stays.
```

### Validation rules (server-side, on settings write)

- `0 ≤ minConsensus ≤ 1`
- `minEvaluators ≥ 1`
- `0.5 ≤ reviewLowerBound < attachThreshold ≤ 1.0`
- If any value is out of range, the write is rejected with a clear error.

### Migration of existing `liveSynthEnabled`

```typescript
// In the existing isLiveSynthEnabledForQuestion helper:
const synthesis = statement.statementSettings?.synthesis;
if (synthesis !== undefined) return synthesis.enabled;

// Fall back to legacy field for 1 release:
const legacy = statement.statementSettings?.liveSynthEnabled;
if (legacy !== undefined) return legacy;

// Then default-by-question-type as before.
```

---

## 4. The unified pipeline (`runSinglePipeline`)

This is the heart of the design. Every entry point calls this function. **Same logic, same Firestore reads, same LLM call (or not), same cluster writes.**

### Signature

```typescript
// File: functions/src/synthesis/pipeline/runSinglePipeline.ts

export interface PipelineInput {
	optionId: string;
	source: 'onCreate' | 'onThresholdCross' | 'queueWorker' | 'synthesizeNow' | 'selective';
	/** Optional: pre-loaded option to avoid a Firestore read. */
	option?: Statement;
	/** Optional: pre-loaded parent question. */
	parent?: Statement;
	/**
	 * When true, the pipeline skips the minEvaluators/minConsensus check.
	 * Set by the selective-synthesis admin path so an admin can force a
	 * specific option through even if it hasn't gathered enough engagement.
	 * NEVER set by automatic triggers — only the admin callables can pass it.
	 */
	forceProcess?: boolean;
}

export interface PipelineResult {
	action: 'attached' | 'spawned' | 'seeded-singleton' | 'review-queued' | 'skipped';
	reason: string;
	clusterId?: string;
	llmCalled: boolean;
	durationMs: number;
}

export async function runSinglePipeline(input: PipelineInput): Promise<PipelineResult>;
```

### Body (pseudocode — actual implementation in §13)

```
1. Load option (if not provided). Bail if missing or wrong type.
2. Load parent question (if not provided). Bail if missing.
3. Read synthesisSettings from parent. Bail if !enabled.
4. Check membership: if option already in a cluster, skip.
5. Read option's evaluation aggregate.
   If !forceProcess:
     If numberOfEvaluators < settings.minEvaluators: skip ("below-threshold").
     If consensus < settings.minConsensus: skip ("below-threshold").
6. Ensure embedding (reuse existing ensureEmbedding helper).
7. vectorSearchService.findSimilarByEmbedding(
       embedding, parentId,
       { limit: 10, threshold: settings.reviewLowerBound }
   )
8. Drop self-match. If no neighbors: spawn singleton cluster, return.
9. Take top neighbor by cosine.
10. Decision tree:
    - cosine >= settings.attachThreshold AND isCluster(top):
        attachOptionToCluster(top, option). 0 LLM calls. Return 'attached'.
    - cosine >= settings.attachThreshold AND isOption(top):
        spawnClusterFromPair(option, top). 1 LLM call (proposal generator).
        Return 'spawned'.
    - cosine in [reviewLowerBound, attachThreshold):
        queueForReview(option, top). 0 LLM calls. Return 'review-queued'.
    - (Defensive — below threshold means findSimilar returned nothing):
        seed singleton. Return 'seeded-singleton'.
```

**Important:** the only place we make an LLM judge call in this design is inside `spawnClusterFromPair` when the proposal generator produces the merged title/description. There is no separate `judgeSemanticEquivalence` call in the live pipeline — the cosine ≥ 0.95 threshold IS our same/different judgment for the auto-attach path. We are explicitly trading some precision (rare 0.95 cosine pairs that are actually different) for cost. The gray band [0.85, 0.95) catches the ambiguous middle for human review.

### Extracted from existing code

`runSinglePipeline` is essentially the decision tree at `onOptionCreateLive.ts:455-484`, refactored out of the trigger handler into a reusable function. Most of the existing helpers (`ensureEmbedding`, `attachOptionToCluster`, `spawnClusterFromPair`, `queueForReview`, `checkAndUpdateSpawnDebounce`) move into `pipeline/` modules unchanged.

---

## 5. Entry point A — on option create

### File
`functions/src/synthesis/liveSynth/onOptionCreateLive.ts` (MODIFY)

### Change summary
- Keep the trigger registration in `index.ts`.
- Replace the inline decision tree with a single call:

```typescript
export async function liveSynthOnOptionCreate(rawStatement: unknown): Promise<void> {
	if (!synthesisFlags.liveSynth) return;
	const statement = rawStatement as Statement;
	if (!isOption(statement)) return;
	if (!statement.parentId || statement.parentId === 'top') return;
	if ((statement.integratedOptions ?? []).length > 0) return;
	const optedOutOfMergeRaw = (statement as unknown as Record<string, unknown>)['optedOutOfMerge'];
	if (optedOutOfMergeRaw === false) return;

	try {
		await runSinglePipeline({ optionId: statement.statementId, source: 'onCreate', option: statement });
	} catch (error) {
		logger.warn('liveSynth.onOptionCreate: pipeline failed', {
			statementId: statement.statementId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}
```

### Why the gate widening
The existing code only acts when `optedOutOfMerge === true` (it was conceived as a background safety net for the foreground "join similar?" prompt). For the living-synth product, the trigger fires for **every** newly-created option whose parent has synthesis enabled. The foreground prompt still wins via the `optedOutOfMerge === false` short-circuit. The other branches (`undefined` / missing, `true`) all proceed.

### Cost guard
The 60 s per-parent spawn debounce stays — see `SPAWN_DEBOUNCE_MS`. This prevents N clusters being spawned in a burst when N similar options arrive in quick succession.

---

## 6. Entry point B — on evaluation / threshold cross

### File
`functions/src/synthesis/liveSynth/onOptionEvaluationChange.ts` (NEW)

### Trigger registration
Watch the existing evaluation collection (whatever the codebase already uses to aggregate `numberOfEvaluators` / `consensus` on a Statement — search `onWrite` of evaluation aggregator). Most likely we hook into the existing evaluation rollup trigger and add a tail call rather than registering a new top-level trigger.

### Logic

```typescript
export async function onOptionEvaluationChange(
	before: Statement | undefined,
	after: Statement | undefined,
): Promise<void> {
	if (!after || !isOption(after)) return;
	if ((after.integratedOptions ?? []).length > 0) return;       // already clustered
	if (!after.parentId || after.parentId === 'top') return;

	const beforeEvals = before?.evaluation?.numberOfEvaluators ?? 0;
	const afterEvals = after.evaluation?.numberOfEvaluators ?? 0;
	const beforeCons = before?.consensus ?? 0;
	const afterCons = after.consensus ?? 0;

	// Only act if eval count went UP or consensus changed meaningfully —
	// avoid re-running on every minor evaluation tick.
	if (afterEvals <= beforeEvals && Math.abs(afterCons - beforeCons) < 0.01) return;

	const settings = await loadSynthesisSettings(after.parentId);
	if (!settings.enabled) return;

	const wasBelow = beforeEvals < settings.minEvaluators || beforeCons < settings.minConsensus;
	const nowAbove = afterEvals >= settings.minEvaluators && afterCons >= settings.minConsensus;

	if (!(wasBelow && nowAbove)) return;   // only the moment of crossing fires

	await runSinglePipeline({
		optionId: after.statementId,
		source: 'onThresholdCross',
		option: after,
	});
}
```

### Why "moment of crossing" only
We could re-run the pipeline on every evaluation change above threshold, but that's wasted work — the option's cluster assignment doesn't change just because the evaluator count went from 5 to 6. We act exactly once, when the option transitions from "pending" to "eligible." Subsequent evaluations only matter for cluster aggregation, which is handled by the existing `enqueueClusterRecompute` mechanism.

### Falling below threshold
Per the design decision: an option that falls below threshold **stays in its cluster.** The UI can hide low-consensus options at display time. No trigger removes a member from a cluster based on a below-threshold transition.

---

## 7. Entry point C — queue worker

### Files
- `functions/src/synthesis/queue/processSynthesisQueue.ts` (NEW)
- `functions/src/synthesis/queue/enqueue.ts` (NEW)

### Firestore schema

```
synthesisQueue/{questionId}                          ← progress doc
  {
    questionId: string,
    enqueuedCount: number,
    processedCount: number,
    failedCount: number,
    pendingCount: number,                  // = enqueuedCount - processedCount - failedCount
    status: 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled',
    operation: 'synthesizeNow' | 'selective' | 'rejudge' | 'mixed',
    rateHint: number,                      // items/min, currently global constant
    startedAt: number,
    lastTickAt: number,
    etaMinutes: number,
    initiatedBy: string,                   // uid of admin who started the run
    lastError?: string,
    cancelledBy?: string,
    cancelledAt?: number,
  }

synthesisQueue/{questionId}/items/{itemId}           ← work units
  {
    itemId: string,                        // deterministic; see below
    questionId: string,
    kind: 'process-option' | 'rejudge-medoid-pair',
    optionId?: string,                     // for kind='process-option'
    medoidPair?: { a: string, b: string }, // for kind='rejudge-medoid-pair'
    forceProcess?: boolean,                // for kind='process-option' from selective synth
    enqueuedAt: number,
    attempts: number,
    lastError?: string,
  }
```

### Deterministic item IDs (idempotency)

```typescript
// kind='process-option':
itemId = `opt-${optionId}`;

// kind='rejudge-medoid-pair':
itemId = `rj-${[a, b].sort().join('-')}`;
```

Re-enqueueing the same option produces the same itemId. `.set(..., { merge: true })` writes idempotently. No duplicate work.

### The scheduled worker

```typescript
// functions/src/synthesis/queue/processSynthesisQueue.ts

import { onSchedule } from 'firebase-functions/v2/scheduler';

const PROCESS_BATCH_SIZE = 50;             // global constant; tune in prod
const MAX_ATTEMPTS = 3;

export const processSynthesisQueue = onSchedule(
	{
		schedule: 'every 1 minutes',
		region: 'me-west1',
		memory: '1GiB',
		timeoutSeconds: 540,
	},
	async () => {
		// Find any question with a non-paused progress doc.
		const progressDocs = await getFirestore()
			.collection('synthesisQueue')
			.where('status', 'in', ['running'])
			.limit(10)                            // process up to 10 questions per tick
			.get();

		for (const progressDoc of progressDocs.docs) {
			await processQuestionBatch(progressDoc.id, PROCESS_BATCH_SIZE);
		}
	},
);

async function processQuestionBatch(questionId: string, batchSize: number): Promise<void> {
	const itemsRef = getFirestore()
		.collection('synthesisQueue')
		.doc(questionId)
		.collection('items');

	const batch = await itemsRef
		.orderBy('enqueuedAt')
		.limit(batchSize)
		.get();

	if (batch.empty) {
		await markQuestionCompleted(questionId);
		return;
	}

	let processed = 0;
	let failed = 0;

	for (const itemDoc of batch.docs) {
		const item = itemDoc.data() as QueueItem;
		try {
			if (item.kind === 'process-option' && item.optionId) {
				await runSinglePipeline({
					optionId: item.optionId,
					source: 'queueWorker',
				});
			} else if (item.kind === 'rejudge-medoid-pair' && item.medoidPair) {
				await rejudgeMedoidPair(item.medoidPair, questionId);
			}
			await itemDoc.ref.delete();
			processed++;
		} catch (error) {
			const attempts = (item.attempts ?? 0) + 1;
			if (attempts >= MAX_ATTEMPTS) {
				await itemDoc.ref.update({
					attempts,
					lastError: error instanceof Error ? error.message : String(error),
					failedAt: Date.now(),
				});
				failed++;
				logger.error('synthesisQueue: item exhausted retries', {
					questionId,
					itemId: itemDoc.id,
					error,
				});
			} else {
				await itemDoc.ref.update({
					attempts,
					lastError: error instanceof Error ? error.message : String(error),
				});
				// Leave in queue; will retry next tick.
			}
		}
	}

	await updateProgressDoc(questionId, processed, failed);
}
```

### Why `every 1 minutes`
At 50 items/min × ~3 s/item, each invocation runs ~2.5 min worst case. That's well inside the 540 s timeout. If a question's queue is large, multiple consecutive ticks drain it. If empty, the worker exits in milliseconds.

### Rate is a global constant for now
Per design decision: keep `PROCESS_BATCH_SIZE = 50` as a single constant. If a single question's queue is genuinely huge and we want to dedicate more capacity to it, the change is a one-line bump and a redeploy. Per-question rate knobs can come later if we find we need them — they are NOT in this ship.

### What if a question fails repeatedly
After 3 attempts, an item is left in the queue with `failedAt` set but `attempts: 3`. The worker filters these out (`where('attempts', '<', 3)` in the items query — TODO add this filter, see §13). The progress doc shows `failedCount > 0`. Admin sees the failed items in the UI and can manually retry or delete.

---

## 8. Admin-initiated synthesis — "Synthesize now"

This is the primary admin action. The button reads simply **"Synthesize"**. It enqueues every option under the question that meets the current thresholds and isn't already clustered. Same code path serves first-time bootstrap, post-threshold-change recomputes, and "I want fresh results now" — there is no separate "bootstrap" concept exposed to admins.

### File
`functions/src/synthesis/admin/fn_synthesizeNow.ts` (NEW)

### Callable

```typescript
export const synthesizeNow = onCall(
	{ region: 'me-west1', timeoutSeconds: 540, memory: '1GiB' },
	async (request) => {
		const { questionId } = request.data as { questionId: string };
		const auth = request.auth;
		if (!auth) throw new HttpsError('unauthenticated', '');

		// Verify admin permission on questionId. (Reuse existing helper.)
		await assertAdminPermission(auth.uid, questionId);

		// Load settings; bail if disabled.
		const settings = await loadSynthesisSettings(questionId);
		if (!settings.enabled) {
			throw new HttpsError('failed-precondition', 'synthesis is not enabled on this question');
		}

		// Check no other operation is running.
		const progressRef = getFirestore().collection('synthesisQueue').doc(questionId);
		const progressSnap = await progressRef.get();
		if (progressSnap.exists && progressSnap.data()?.status === 'running') {
			throw new HttpsError('already-exists', 'a synthesis operation is already running', {
				existingOperation: progressSnap.data()?.operation,
			});
		}

		// Enumerate eligible options.
		const optionsSnap = await getFirestore()
			.collection(Collections.statements)
			.where('parentId', '==', questionId)
			.where('statementType', '==', StatementType.option)
			.where('integratedOptions', '==', [])           // NOT already in a cluster
			.get();

		let enqueued = 0;
		for (const optionDoc of optionsSnap.docs) {
			const option = optionDoc.data() as Statement;
			const evals = option.evaluation?.numberOfEvaluators ?? 0;
			const cons = option.consensus ?? 0;
			if (evals < settings.minEvaluators) continue;
			if (cons < settings.minConsensus) continue;
			await enqueueItem(questionId, {
				kind: 'process-option',
				optionId: option.statementId,
				forceProcess: false,
			});
			enqueued++;
		}

		// Initialize progress doc.
		await progressRef.set({
			questionId,
			operation: 'synthesizeNow',
			status: 'running',
			enqueuedCount: enqueued,
			processedCount: 0,
			failedCount: 0,
			pendingCount: enqueued,
			rateHint: 50,
			startedAt: Date.now(),
			lastTickAt: Date.now(),
			etaMinutes: Math.ceil(enqueued / 50),
			initiatedBy: auth.uid,
		});

		return { enqueued, etaMinutes: Math.ceil(enqueued / 50) };
	},
);
```

### What the admin sees
A button labeled **"Synthesize"** at the top of the synthesis panel. Clicking it:
1. Shows a confirmation modal: "About to synthesize ~N options. ETA: ~M minutes."
2. On confirm, calls `synthesizeNow`. Returns in <2 s.
3. UI subscribes to `synthesisQueue/{questionId}` and shows a progress bar (see §10).
4. Pause / Cancel controls (see §8c) are available while running.

### Edge case: very large enumerations
For a question with 100k options, `optionsSnap` returns 100k docs in one shot. That's ~50 MB best case — fine for memory at 1 GiB, but slow. If we ever hit a question with 500k+ options, we paginate the enumeration: `query.orderBy(...).startAfter(...).limit(5000)` in a loop, enqueuing as we go. **Not in this ship — defer until we see a real case.**

---

## 8b. Selective synthesis — admin force-picks options

Admin opens a list of options under the question, ticks specific ones, and clicks **"Synthesize selected."** Selected options skip the engagement threshold check (`forceProcess: true`) but still go through the same pipeline — same cosine thresholds, same attach/spawn/review logic. This is useful for surfacing important options that haven't gathered evaluators yet (admin curation), or for fixing options that fell through the cracks.

### Constraints
- Admin can select **up to 200 options at a time** per call (Firestore `in` query limit + UX sanity bound). For larger batches the UI offers "Select all matching filter" which submits up to 5,000 IDs in chunks, each chunk one callable invocation. Same progress doc tracks the merged total.
- Selected options that are **already in a cluster** are silently skipped (the pipeline's existing membership check handles this — see §4 step 4).
- The progress doc operation field is set to `'selective'` so the UI distinguishes this from "Synthesize now."

### File
`functions/src/synthesis/admin/fn_synthesizeSelected.ts` (NEW)

### Callable

```typescript
export const synthesizeSelected = onCall(
	{ region: 'me-west1', timeoutSeconds: 120, memory: '512MiB' },
	async (request) => {
		const { questionId, optionIds } = request.data as {
			questionId: string;
			optionIds: string[];
		};
		const auth = request.auth;
		if (!auth) throw new HttpsError('unauthenticated', '');

		if (!Array.isArray(optionIds) || optionIds.length === 0) {
			throw new HttpsError('invalid-argument', 'optionIds must be a non-empty array');
		}
		if (optionIds.length > 200) {
			throw new HttpsError('invalid-argument', 'optionIds must be <= 200 per call');
		}

		await assertAdminPermission(auth.uid, questionId);

		const settings = await loadSynthesisSettings(questionId);
		if (!settings.enabled) {
			throw new HttpsError('failed-precondition', 'synthesis is not enabled on this question');
		}

		// If another operation is running, MERGE into it rather than reject.
		// Selective is additive — admins shouldn't have to wait for an in-flight
		// run to finish before adding more items.
		const progressRef = getFirestore().collection('synthesisQueue').doc(questionId);
		const progressSnap = await progressRef.get();
		const existing = progressSnap.exists ? progressSnap.data() : null;

		// Verify all optionIds actually exist under this questionId and are options.
		const validatedIds = await validateOptionIdsBelongToQuestion(optionIds, questionId);
		if (validatedIds.length === 0) {
			throw new HttpsError('invalid-argument', 'no valid options for this question in the request');
		}

		let enqueued = 0;
		for (const optionId of validatedIds) {
			await enqueueItem(questionId, {
				kind: 'process-option',
				optionId,
				forceProcess: true,    // <-- skip threshold check
			});
			enqueued++;
		}

		if (existing && existing.status === 'running') {
			// Merge into existing progress doc.
			await progressRef.update({
				enqueuedCount: (existing.enqueuedCount ?? 0) + enqueued,
				pendingCount: (existing.pendingCount ?? 0) + enqueued,
				operation: 'mixed',           // both kinds in play
				lastTickAt: Date.now(),
				etaMinutes: Math.ceil(((existing.pendingCount ?? 0) + enqueued) / 50),
			});
		} else {
			// Fresh progress doc.
			await progressRef.set({
				questionId,
				operation: 'selective',
				status: 'running',
				enqueuedCount: enqueued,
				processedCount: 0,
				failedCount: 0,
				pendingCount: enqueued,
				rateHint: 50,
				startedAt: Date.now(),
				lastTickAt: Date.now(),
				etaMinutes: Math.ceil(enqueued / 50),
				initiatedBy: auth.uid,
			});
		}

		return { enqueued, etaMinutes: Math.ceil(enqueued / 50) };
	},
);
```

### What the admin sees
In the synthesis panel, below the "Synthesize" button, an expandable section labeled **"Synthesize selected options."** Expanded, it shows:
- A scrollable list of all options under the question, with columns: checkbox, option text (truncated), evaluator count, consensus, current cluster membership ("in cluster X" / "ungrouped").
- A filter bar above the list: text search, "show only ungrouped," "show only below-threshold."
- A **"Synthesize N selected"** button (disabled until at least one checkbox is ticked).
- A **"Select all matching filter"** link for bulk selection.

The list is paginated by Firestore query (50 per page) to keep DOM size sane.

---

## 8c. Pause / Cancel controls

Pause and Cancel act on the **progress doc**, not on individual items. The queue worker (§7) checks `progress.status` on each tick.

### Pause
Admin clicks **"Pause."** Frontend writes `{ status: 'paused' }` to `synthesisQueue/{questionId}`. The worker's `where('status', 'in', ['running'])` filter excludes paused questions, so no new items are processed. In-flight items already in the current batch finish (it's a tight loop, ≤2.5 min worst case).

### Resume
Admin clicks **"Resume."** Frontend writes `{ status: 'running' }`. Next worker tick drains.

### Cancel
Admin clicks **"Cancel."** Confirmation modal: "Cancel synthesis? N items will not be processed."
On confirm, the callable `synthesisCancel`:
1. Sets `progress.status = 'cancelled'`.
2. Deletes all remaining items in `synthesisQueue/{questionId}/items/` via paginated batched deletes (so we don't blow Firestore batch limits).
3. Records `cancelledBy: auth.uid` and `cancelledAt: Date.now()`.

Items already processed remain processed (their cluster assignments stand). Cancel is **not** "undo" — it only stops future work.

### File
`functions/src/synthesis/admin/fn_synthesisControl.ts` (NEW, ~80 LoC)

Exposes three callables: `synthesisPause`, `synthesisResume`, `synthesisCancel`. All read the progress doc, verify admin permission on `questionId`, and update accordingly. The cancel implementation includes the paginated-delete loop.

---

## 9. Re-judge gray-band admin operation

### File
`functions/src/synthesis/admin/fn_rejudgeGrayBand.ts` (NEW)

### What it does
Walks all clusters under a question, takes their medoids, runs `findNearest` on each medoid, and for any medoid pair whose cosine is in [reviewLowerBound, attachThreshold), enqueues a `rejudge-medoid-pair` item. The queue worker then runs `runSinglePipeline`-equivalent logic (or a dedicated `rejudgeMedoidPair` helper, see below) for each pair.

### Why this exists
Even with the on-write pipeline running perfectly, cluster medoids can drift over time as new members are added. Two clusters that were once distinct can become semantically equivalent. This admin button is the periodic "sanity check" — usually fast (tens to low hundreds of pairs), never blocking, fully optional.

### Helper

```typescript
// functions/src/synthesis/pipeline/rejudgeMedoidPair.ts (NEW)

export async function rejudgeMedoidPair(
	pair: { a: string; b: string },
	questionId: string,
): Promise<void> {
	const [clusterA, clusterB] = await Promise.all([
		loadStatement(pair.a),
		loadStatement(pair.b),
	]);
	if (!clusterA || !clusterB) return;
	if (!isCluster(clusterA) || !isCluster(clusterB)) return;   // one was dissolved

	// Reload medoids (representative member of each cluster, cosine-central).
	const [medoidA, medoidB] = await Promise.all([
		computeMedoid(clusterA),
		computeMedoid(clusterB),
	]);

	// One LLM call to judge: same / different / opposite.
	const verdict = await judgeSemanticEquivalence(medoidA, medoidB, questionId);

	if (verdict === 'same') {
		// Merge clusterB into clusterA. Choose target by member count (larger wins).
		await mergeClusters(clusterA, clusterB);
	}
	// 'different' or 'opposite': leave alone.
}
```

`judgeSemanticEquivalence` and `mergeClusters` come from existing code — both exist in `functions/src/synthesis/` and we reuse them.

---

## 10. Admin UI

### Where it lives
On the question Statement settings page. There is already a `statementSettings` admin panel in the main app — we add a new section "Synthesis."

### What the panel shows

```
┌─ Synthesis ────────────────────────────────────────────────────┐
│                                                                 │
│  Enable synthesis on this question?  [ ON / OFF ]               │
│                                                                 │
│  ─ Engagement thresholds ──────────────────────────────────────│
│                                                                 │
│  Minimum evaluators per option:    [  3  ▼]                     │
│  Minimum consensus per option:     [ 0.0 ▼]   (range 0–1)       │
│                                                                 │
│  ─ Similarity thresholds (advanced) ──────────────────────────│
│                                                                 │
│  Auto-attach if cosine ≥        [ 0.95 ▼]                       │
│  Send for review if cosine ≥    [ 0.85 ▼]   (must be <)         │
│                                                                 │
│  ─ Run synthesis ───────────────────────────────────────────────│
│                                                                 │
│  [  Synthesize  ]                                               │
│         Processes all eligible options under this question.     │
│                                                                 │
│  [ ▸ Synthesize selected options ]    ◀ click to expand         │
│                                                                 │
│    ┌── Options list ──────────────────────────────────────┐    │
│    │ 🔍 search...    □ ungrouped only  □ below threshold  │    │
│    │ ─────────────────────────────────────────────────── │    │
│    │ ☐  "Build more affordable housing near…"   12   0.4  │    │
│    │ ☐  "Allow density bonuses for transit-…"    3   0.7  │    │
│    │ ☑  "Streamline permitting for ADUs…"        1   0.2  │    │
│    │ ☑  "Tax-incentive zones for low-rise…"      0   —    │    │
│    │  ... (paginated, 50/page)                             │    │
│    │                                                       │    │
│    │   2 selected     [Select all matching filter]         │    │
│    │   [ Synthesize 2 selected ]                           │    │
│    └───────────────────────────────────────────────────────┘   │
│                                                                 │
│  [ Re-judge gray-band pairs ]    (advanced)                     │
│                                                                 │
│  ─ Status ──────────────────────────────────────────────────────│
│                                                                 │
│  Running: 1,234 pending, 8,766 processed, 0 failed              │
│  ETA: 25 minutes        [ Pause ]  [ Cancel ]                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

When idle, the Status section reads: "No synthesis running." When paused: "Paused — 1,234 items pending. [Resume] [Cancel]."

### Files (frontend)

| File | LoC |
|---|---|
| `src/view/pages/statement/components/settings/synthesisPanel/SynthesisPanel.tsx` | ~280 |
| `src/view/pages/statement/components/settings/synthesisPanel/SynthesisPanel.module.scss` | ~180 |
| `src/view/pages/statement/components/settings/synthesisPanel/SynthesisProgressBar.tsx` | ~100 |
| `src/view/pages/statement/components/settings/synthesisPanel/SelectiveOptionsList.tsx` | ~200 |
| `src/view/pages/statement/components/settings/synthesisPanel/SelectiveOptionsList.module.scss` | ~120 |
| `src/controllers/db/synthesis/saveSynthesisSettings.ts` | ~50 |
| `src/controllers/db/synthesis/listenSynthesisProgress.ts` | ~40 |
| `src/controllers/db/synthesis/triggerSynthesizeNow.ts` | ~30 |
| `src/controllers/db/synthesis/triggerSynthesizeSelected.ts` | ~40 |
| `src/controllers/db/synthesis/triggerRejudge.ts` | ~30 |
| `src/controllers/db/synthesis/synthesisControl.ts` | ~50 |

The `SelectiveOptionsList` component subscribes to the existing `statements` collection filtered by `parentId == questionId AND statementType == option`. Maintains a local `Set<string>` of checked IDs. The filter checkboxes are client-side post-query filters (cheap, since the page renders 50 at a time).

### Translation keys
Add to all six language files in `packages/shared-i18n/src/languages/`. New keys:
- `synthesis.enable`
- `synthesis.minEvaluators`
- `synthesis.minConsensus`
- `synthesis.attachThreshold`
- `synthesis.reviewLowerBound`
- `synthesis.synthesizeButton`
- `synthesis.synthesizeSelectedHeader`
- `synthesis.synthesizeSelectedButton` (with `{count}` placeholder)
- `synthesis.selectAllMatchingFilter`
- `synthesis.filterSearch`
- `synthesis.filterUngroupedOnly`
- `synthesis.filterBelowThresholdOnly`
- `synthesis.rejudgeGrayBand`
- `synthesis.queueStatus`
- `synthesis.eta`
- `synthesis.pause`
- `synthesis.resume`
- `synthesis.cancel`
- `synthesis.cancelConfirm`
- `synthesis.confirmSynthesize` (modal body)

---

## 11. Data model (Firestore)

### New collections / fields

| Path | Purpose |
|---|---|
| `statements/{id}.statementSettings.synthesis` | Per-question admin knobs (§3) |
| `synthesisQueue/{questionId}` | Progress doc, one per active operation |
| `synthesisQueue/{questionId}/items/{itemId}` | Work units |

### Indexes

```json
// firestore.indexes.json — add:
{
  "collectionGroup": "items",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "attempts", "order": "ASCENDING" },
    { "fieldPath": "enqueuedAt", "order": "ASCENDING" }
  ]
}
```

For the queue worker's `where('attempts', '<', 3).orderBy('enqueuedAt')` query.

### Security rules

```
// firestore.rules — add:

match /synthesisQueue/{questionId} {
  // Progress doc readable by admins of the question; writeable only by server.
  allow read: if request.auth != null
    && exists(/databases/$(database)/documents/statementsSubscribe/$(request.auth.uid + '--' + questionId))
    && get(/databases/$(database)/documents/statementsSubscribe/$(request.auth.uid + '--' + questionId)).data.role == 'admin';
  allow write: if false;

  match /items/{itemId} {
    allow read, write: if false;   // server only
  }
}
```

---

## 12. Migration & legacy kill list

### What stays
- `liveSynth/onOptionCreateLive.ts` — refactored to call `runSinglePipeline`
- `liveSynth/onOptionUpdateLive.ts` — keep its drift-detection logic
- `liveSynth/clusterRecompute.ts` — unchanged
- `liveSynth/auditLog.ts` — unchanged
- `liveSynth/featureGate.ts` — extended to read `synthesis.enabled`
- `services/embedding-*` — unchanged
- `services/vector-search-service.ts` — unchanged
- `services/integration-ai-service.ts` (the proposal generator) — unchanged
- `services/verdict-cache-service.ts` — unchanged (the cache still applies to gray-band re-judges)
- `bulkCluster.ts`, `twoTierJudge.ts` — kept temporarily as dead code; deleted in cleanup PR

### What gets deleted (cleanup PR, 30 days after living-only ships clean)
- `functions/src/synthesis/asyncJob/` — entire directory
- `functions/src/synthesis/featureFlags.ts` flags `asyncJobMode`, `bulkCluster`, `twoTierJudge`, `bayesianPrefilter`
- `functions/src/fn_synthesizeIdeas.ts` callable `synthesizeIdeasPreview`
- `functions/src/synthesis/bulkCluster.ts`, `twoTierJudge.ts`, `completeLinkage.ts`
- The `synthesizeIdeasExecute` callable (if it exists separately — verify in cleanup)

### What happens to in-flight async jobs during deploy
At deploy time, check `synthesisJobs/` for `status` not in terminal states. If any exist:
- Log a warning with their IDs.
- Set them to `cancelled` with `cancellationReason: 'migration to living-only architecture'`.

No long-running async-mode jobs are in production today (this is the production-incident path that prompted the redesign), so this should be a no-op in practice.

### `liveSynthEnabled` legacy field
Keep reading it for 1 release as fallback when `synthesis.enabled` is missing. Add a one-time migration script (NOT a Cloud Function) that copies `statementSettings.liveSynthEnabled` to `statementSettings.synthesis.enabled` for all questions where it's set. Run once, log results, done.

---

## 13. File-by-file change list

### NEW files (Cloud Functions)

| File | LoC | Purpose |
|---|---|---|
| `functions/src/synthesis/pipeline/runSinglePipeline.ts` | ~200 | The unified pipeline |
| `functions/src/synthesis/pipeline/loadSynthesisSettings.ts` | ~80 | Helper: load + default settings for a question |
| `functions/src/synthesis/pipeline/rejudgeMedoidPair.ts` | ~120 | Helper for the gray-band re-judge |
| `functions/src/synthesis/pipeline/computeMedoid.ts` | ~80 | Compute the cosine-central member of a cluster |
| `functions/src/synthesis/pipeline/mergeClusters.ts` | ~100 | Merge cluster B into cluster A |
| `functions/src/synthesis/queue/processSynthesisQueue.ts` | ~180 | Scheduled worker |
| `functions/src/synthesis/queue/enqueue.ts` | ~70 | Enqueue helpers |
| `functions/src/synthesis/queue/types.ts` | ~40 | QueueItem, ProgressDoc types |
| `functions/src/synthesis/liveSynth/onOptionEvaluationChange.ts` | ~120 | Threshold-cross trigger |
| `functions/src/synthesis/admin/fn_synthesizeNow.ts` | ~150 | "Synthesize now" callable (all eligible options) |
| `functions/src/synthesis/admin/fn_synthesizeSelected.ts` | ~140 | Selective synthesis (force-process picked options) |
| `functions/src/synthesis/admin/fn_rejudgeGrayBand.ts` | ~120 | Re-judge callable |
| `functions/src/synthesis/admin/fn_synthesisControl.ts` | ~120 | Pause/resume/cancel callables (3 in one file) |
| `functions/src/synthesis/admin/validateOptionIds.ts` | ~50 | Helper: verify optionIds belong to a question + are options |
| `functions/src/synthesis/__tests__/runSinglePipeline.test.ts` | ~300 | Unit tests for the pipeline (including forceProcess branch) |
| `functions/src/synthesis/__tests__/processSynthesisQueue.test.ts` | ~200 | Worker tests |
| `functions/src/synthesis/__tests__/synthesizeNow.test.ts` | ~150 | "Synthesize now" integration test |
| `functions/src/synthesis/__tests__/synthesizeSelected.test.ts` | ~150 | Selective synth integration test |
| `functions/src/synthesis/__tests__/synthesisControl.test.ts` | ~120 | Pause/resume/cancel tests |

**Subtotal: ~2250 LoC new in functions/**

### MODIFIED files (Cloud Functions)

| File | Δ LoC | Change |
|---|---|---|
| `functions/src/synthesis/liveSynth/onOptionCreateLive.ts` | −250 / +30 | Strip decision tree; delegate to runSinglePipeline. Keep gate check, debounce, audit logging |
| `functions/src/synthesis/liveSynth/featureGate.ts` | +20 | Read `synthesis.enabled` with `liveSynthEnabled` fallback |
| `functions/src/index.ts` | +12 | Register new trigger + new callables |
| `firestore.indexes.json` | +1 entry | Index for queue items query |
| `firestore.rules` | +15 | Lock down `synthesisQueue/` |

### NEW files (frontend)

| File | LoC |
|---|---|
| `src/view/pages/statement/components/settings/synthesisPanel/SynthesisPanel.tsx` | ~280 |
| `src/view/pages/statement/components/settings/synthesisPanel/SynthesisPanel.module.scss` | ~180 |
| `src/view/pages/statement/components/settings/synthesisPanel/SynthesisProgressBar.tsx` | ~100 |
| `src/view/pages/statement/components/settings/synthesisPanel/SelectiveOptionsList.tsx` | ~200 |
| `src/view/pages/statement/components/settings/synthesisPanel/SelectiveOptionsList.module.scss` | ~120 |
| `src/controllers/db/synthesis/saveSynthesisSettings.ts` | ~50 |
| `src/controllers/db/synthesis/listenSynthesisProgress.ts` | ~40 |
| `src/controllers/db/synthesis/triggerSynthesizeNow.ts` | ~30 |
| `src/controllers/db/synthesis/triggerSynthesizeSelected.ts` | ~40 |
| `src/controllers/db/synthesis/triggerRejudge.ts` | ~30 |
| `src/controllers/db/synthesis/synthesisControl.ts` | ~50 |
| `packages/shared-i18n/src/languages/{en,he,ar,es,de,nl}.json` | +20 keys × 6 |
| `src/view/pages/statement/components/settings/synthesisPanel/__tests__/SynthesisPanel.test.tsx` | ~140 |
| `src/view/pages/statement/components/settings/synthesisPanel/__tests__/SelectiveOptionsList.test.tsx` | ~120 |

**Subtotal: ~1380 LoC new in src/**

### DELETED files (cleanup PR, 30 days after stable ship)

See §12 kill list. Roughly 2,500 LoC removed.

### Net code delta after both PRs land
- Initial ship: +~3,630 LoC (functions ~2,250 + frontend ~1,380)
- Cleanup ship: −~2,500 LoC
- **Net: ~+1,130 LoC**

Even with the admin-initiated synthesis layer (synthesize now + selective + pause/cancel), the new system is meaningfully smaller than what it replaces — and most of the size is in tests and the frontend, not core logic.

---

## 14. Verification plan

### Pre-merge tests
- `npm run typecheck` passes in functions/ and root.
- `npm run lint` passes.
- `cd functions && npm test` — all new tests pass, existing tests pass.
- Unit tests cover:
  - Pipeline decision tree: all 5 branches.
  - Settings load: missing settings, partial settings, validation rejection.
  - Queue worker: empty queue, mixed items, retry, max-attempts failure.
  - Threshold-cross trigger: below→below (no-op), below→above (fires), above→above (no-op), above→below (no-op).
  - Bootstrap callable: enumerates correctly, filters correctly, enqueues with deterministic IDs.

### Pre-deploy staging tests
On a test Firebase project with seeded data:

1. **Seed 100 options under one question. All eligible.** Enable synthesis. Click "Synthesize."
   - Expected: queue fills to ~100, worker drains in ~2 min, ~10 clusters emerge, ~80% of options attached or seeded.
2. **Add a new option that matches an existing cluster at cosine ≥0.95.**
   - Expected: onCreate trigger attaches within 5 s. No LLM call (cache hit on attach path, or skipped entirely since 0.95 is auto-attach).
3. **Add an option that's in the gray band (~0.88 to nearest cluster).**
   - Expected: review-queued. Logged to `_liveSynthCandidates/`.
4. **Lower minEvaluators from 3 to 1.** Click "Synthesize" again.
   - Expected: previously-skipped options now enqueue and process. Same code path; admin doesn't see a different "operation type."
5. **Selective synthesis with 5 below-threshold options.**
   - Expected: all 5 enqueue with `forceProcess: true`. Pipeline skips threshold check for these and runs them through. Some attach, some seed, some land in gray band — same decision tree.
6. **Selective synthesis with an option that's already in a cluster.**
   - Expected: enqueued but silently skipped by pipeline's membership check (§4 step 4). No error, no duplicate work.
7. **Selective synthesis while "Synthesize now" is mid-run.**
   - Expected: items merge into the existing progress doc. Operation flips to `'mixed'`. ETA recalculates.
8. **Pause mid-run.** Click "Pause."
   - Expected: queue worker skips this question on next tick. UI shows "Paused — N pending." [Resume] and [Cancel] visible.
9. **Resume.** Click "Resume."
   - Expected: worker resumes draining within 60 s.
10. **Cancel mid-run.** Click "Cancel" → confirm.
    - Expected: status flips to `'cancelled'`. All remaining items in `items/` subcollection are deleted within ~30 s (paginated batch deletes). Already-processed items keep their cluster assignments.
11. **Kill a scheduled function invocation mid-batch.**
    - Expected: at most one in-flight item lost; on next tick, queue still drains correctly. Idempotency means no duplicate clusters.
12. **Two admins click "Synthesize" simultaneously.**
    - Expected: first call returns success. Second call returns `already-exists` error. UI shows existing operation status.
13. **Admin clicks "Synthesize selected" with 250 options checked.**
    - Expected: UI rejects with "Max 200 per call" message, OR auto-chunks into 2 calls of ≤200 each (decision: keep simple, just reject and let admin click in batches; UI shows count check before submit).

### Post-deploy production canary
- Enable on one mass-consensus question with ~500 existing options.
- Run bootstrap.
- Monitor:
  - LLM call count (should be ≈ 20% of enqueued items, matching the bulk-path expectation).
  - Total wall time (target <15 min).
  - Any errors in `synthesisQueue` items with `attempts: 3`.
- Verify cluster output quality with the question's admin (manual review of ~10 clusters).

### Rollback plan
If the ship has a problem in production:
1. Set `SYNTHESIS_LIVE_SYNTH_ENABLED=false` in function config and redeploy. Triggers exit at top.
2. Set every `synthesisQueue/{q}.status` to `paused` via a one-shot script. Worker stops touching queues.
3. New options created during rollback are NOT clustered — they go into the option list as standalone. This is acceptable; the merge can be done later when synthesis is re-enabled.
4. The legacy `synthesizeIdeasPreview` callable is still deployed (we haven't run cleanup PR yet). Admins fall back to clicking it for small questions until the issue is fixed.

---

## 15. Out of scope / explicitly deferred

These came up during design discussions and are NOT in this ship:

1. **Per-question rate knob.** Global constant `PROCESS_BATCH_SIZE = 50` for now. Add per-question rate only if we see real cases where it's needed.
2. **Auto-removal of below-threshold options from clusters.** Falling-below stays clustered, per design. UI filters at display time.
3. **Auto-dissolution of clusters when one member is removed.** Existing `onOptionUpdateLive.ts` handles unlink-on-drift; it should already cover member-count=1 dissolution. Verify but don't extend.
4. **Cross-question synthesis.** Synthesis is always scoped to a single parent question.
5. **Multi-language synthesis.** Embedding model is multilingual; the existing pipeline handles this. No extra work.
6. **Synthesis as a public API.** No new public endpoints. Admin UI only.
7. **Cost reporting in the admin UI.** Show queue progress, not estimated $. Cost reporting is a separate ship.
8. **Capacitor / mobile admin UI.** The settings panel is web-only initially. Capacitor port is a separate ship if needed.
9. **Migration script for bulk-converting `liveSynthEnabled` → `synthesis.enabled`.** Stand-alone script, runs once. Not part of the deploy.
10. **Replacing the `judgeSemanticEquivalence` LLM call with a cheaper model.** Stay on current Gemini; tuning is a separate optimization ship.
11. **Full re-synthesis (destructive teardown of existing clusters).** Considered and rejected during design. Risk of destroying admin-curated clusters outweighs the convenience. If admins want to nuke clusters, they can delete cluster Statements manually — that's already supported.
12. **Threshold override for one run.** Considered and rejected — the "Selective synthesis" path covers the same use case (force-process specific options) with finer control. Adding a global override knob would let admins accidentally process noise at scale.

---

## Appendix A — Why not shards/parallelism

An earlier proposal (`plans/synthesis-100k-living-synth.md` and the system-architect's revision) sharded synthesis work across Firestore-triggered functions running in parallel, achieving "100k options in ~15 minutes." That design solved a problem we don't have:

- **We don't need synthesis to finish fast.** Background work is allowed to take an hour.
- **We don't need parallelism.** A patient queue at 50/min handles real-world question sizes (100k options at 10% threshold pass-through = ~3.5 hours, which is acceptable for a one-time bootstrap).
- **We do need correctness, observability, and pause/resume.** All easier with one worker than with a shard fan-out.

The shard design had: a job state machine with 9 statuses, shard subcollection, partials subcollection, fanout phase, reducer transaction, parallel concurrency caps, deterministic shard IDs, idempotency-via-hash, heartbeat sweep, three Firestore triggers, two new callables.

This design has: one Firestore collection (`synthesisQueue/{q}/items`), one scheduled function, one progress doc. **About 5x less code and ~5x less surface to debug.**

The shard design's complexity was paying for *parallelism*. The product decision was that we don't need parallelism. So we don't pay for it.

---

## Appendix B — Sequencing for the implementing engineer

A suggested 7-day breakdown (was 5; expanded to cover admin-initiated synthesis):

**Day 1: Skeleton + tests**
- Settings type, `loadSynthesisSettings`, defaults, validation.
- `runSinglePipeline` skeleton (no body yet) + signature + tests, including `forceProcess` branch.
- Firestore index for queue items.

**Day 2: The pipeline**
- Fill in `runSinglePipeline` by lifting code from `onOptionCreateLive.ts`.
- Unit tests for all 5 decision branches + the `forceProcess` path.
- Refactor `onOptionCreateLive.ts` to delegate.

**Day 3: Queue + worker**
- `synthesisQueue/` schema, `enqueueItem` helper.
- `processSynthesisQueue` scheduled function.
- Tests: empty queue, mixed items, retry semantics.
- `fn_synthesisControl.ts` (pause/resume/cancel) + tests.

**Day 4: Automatic triggers + "synthesize now"**
- `onOptionEvaluationChange` trigger + tests.
- `synthesizeNow` callable + tests.
- Wire into `index.ts`.

**Day 5: Selective synthesis + re-judge**
- `synthesizeSelected` callable + `validateOptionIds` helper + tests.
- `rejudgeGrayBand` callable + tests.
- Manual end-to-end smoke test on emulator.

**Day 6: Frontend (settings + main panel)**
- `SynthesisPanel` component + SCSS.
- Progress bar subscribed to Firestore.
- "Synthesize" / "Re-judge" buttons + confirmation modals.
- Pause/Resume/Cancel buttons.
- Translation keys in all 6 languages.

**Day 7: Frontend (selective list) + integration**
- `SelectiveOptionsList` component with checkbox/filter/pagination + SCSS.
- Wire to `triggerSynthesizeSelected.ts` controller.
- Staging end-to-end tests from §14.
- Visual review with a screen reader for a11y.

Total: ~7 focused days. Ship to staging end of day 7; canary in prod day 8–10; clean up old code at day 30.
