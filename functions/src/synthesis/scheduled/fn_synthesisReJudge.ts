import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, functionConfig, StatementType, type Statement } from '@freedi/shared-types';
import { embeddingCache } from '../../services/embedding-cache-service';
import { recordLiveSynthEvent } from '../liveSynth/auditLog';
import { enqueueClusterRecompute } from '../liveSynth/clusterRecompute';
import { generateSynthesizedProposal } from '../../services/integration-ai-service';
import { judgeSemanticEquivalence } from '../../services/semantic-equivalence-service';
import { consolidateThemes } from '../pipeline/consolidateThemes';
import { loadSynthesisSettingsFromStatement } from '../pipeline/loadSynthesisSettings';
import { enqueueItem } from '../queue/enqueue';

/**
 * Merge gate for reJudge.
 *
 * Set BELOW DEFAULT_SYNTHESIS_SETTINGS.attachThreshold (0.85) because the
 * live pipeline's attach gate is per-pair (one cosine value), while reJudge
 * uses top-2 cross-member-pair average (two pairs must agree). The two-pair
 * confirmation provides natural robustness, so we can be more permissive on
 * the single-number cutoff without admitting outlier-driven merges.
 *
 * Calibrated against the synth benchmark: friends-time and
 * community-clubs paraphrases in run #6 split into 5+4 synths with
 * cross-member top-2 average in the 0.80-0.84 range. 0.82 captures those
 * true duplicates while leaving cross-topic pairs (typical top-2-avg ≤0.75)
 * untouched.
 *
 * That calibration is correct about cross-TOPIC pairs and silent about the band
 * that actually matters: DISTINCT ideas within the SAME topic. Measured on the
 * 100-statement accuracy corpus, seven such pairs sit at 0.823-0.855 —
 * recycling-pickup vs compost-organic-waste at 0.855, affordable-quota vs
 * convert-offices at 0.845 — and those two were exactly the false merges in the
 * certified run, the entire remaining precision loss.
 *
 * No threshold separates them. True duplicate synths were measured at 0.80-0.84
 * and distinct same-topic synths at 0.82-0.86: the bands overlap. Raising the
 * number trades the bug this sweep exists to fix for the bug it causes. So the
 * cosine stays a CANDIDACY signal and the decision moves to the LLM below.
 */
const REJUDGE_MERGE_THRESHOLD = 0.82;

/**
 * Cross-synth reJudge sweep — merges duplicate synths the live pipeline
 * created in separate moments under spawn-debounce conditions.
 *
 * Scenario this targets (observed on the synth benchmark at run #5):
 *   - Live pipeline spawns synth A at cosine 0.88 from paraphrase pair {a1, a2}.
 *   - 12 s later paraphrase a3 arrives. Synth A's title-embedding cosine to a3
 *     is ~0.78 (Stage B member-promotion brings it to ~0.86 — fine, attaches).
 *   - But under bulk spawn timing, paraphrase a7 finds a8 first and spawns
 *     synth B from {a7, a8} during synth A's spawn-debounce window.
 *   - Result: 2 synths that should be one. Stage B can't merge them because
 *     it only attaches plain options into clusters — it doesn't merge cluster
 *     statements into each other.
 *
 * This sweep finds those: for each parent with ≥2 synths, computes pairwise
 * cross-synth best-member cosines, and when the best-pair cosine ≥
 * attachThreshold (i.e. two members from different synths are near-duplicates),
 * merges donor into recipient. Recipient is the synth with more members;
 * ties broken by earlier `createdAt`.
 *
 * Cosine proposes, the LLM disposes. The cross-member top-2 average selects a
 * candidate pair; `confirmMergeWithLlm` then decides, because cosine provably
 * cannot separate "two wordings of one proposal" from "two distinct proposals
 * about the same thing" — those bands overlap at 0.82-0.86 (see the threshold
 * docstring above). At most MAX_MERGES_PER_PARENT judge calls per parent per
 * sweep, on a 10-minute schedule, for an operation that is irreversible from
 * the reader's point of view. The recipient's title regenerates after the merge
 * via enqueueClusterRecompute.
 *
 * Bounded: at most MAX_PARENTS_PER_SWEEP per tick; at most MAX_MERGES_PER_PARENT
 * to avoid a runaway chain of merges that should be its own design decision.
 *
 * Cost per parent with M synths averaging K members: 1 batch read of M*K
 * member embeddings + O(M²·K²) in-memory cosine comparisons. At realistic
 * parent sizes (M ≤ 50, K ≤ 100) that's ≤25M comparisons per parent — fast.
 */

const MAX_PARENTS_PER_SWEEP = 30;
const MAX_MERGES_PER_PARENT = 10;
const SYNTH_QUERY_LIMIT = 2_000;

interface CandidateSynth {
	doc: Statement;
	members: string[];
}

function db() {
	return getFirestore();
}

function cosine(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) return 0;
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	if (na === 0 || nb === 0) return 0;

	return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

interface MergeDecision {
	recipientIdx: number;
	donorIdx: number;
	bestCosine: number;
}

/** Order-independent key for a synth pair, so a rejected pair is not retried. */
function pairKey(a: string, b: string): string {
	return [a, b].sort().join('__');
}

/**
 * Ask the synthesis judge whether two synths are really one proposal.
 *
 * Reuses `generateSynthesizedProposal` — the same prompt that decides whether a
 * pair of raw statements may merge — and feeds it the synths' MEMBER STATEMENTS,
 * not their titles.
 *
 * Feeding it titles was tried first and measurably failed: the gate approved
 * both bad merges it was added to stop, refusing nothing at all in a
 * 100-statement run. The reason is the same abstraction that makes synth titles
 * unreliable for attach evidence. "Require Affordable Apartments in Every New
 * Residential Development" and "Convert Vacant Offices into Housing" read as two
 * angles on one housing proposal once both have been generalised into policy
 * language; the members they were generated from — "Require developers to
 * include affordable units in every new building" and "Convert empty office
 * buildings into apartments" — plainly do not. The judge's measured strength is
 * on concrete statements: it refused all 14 distinct raw pairs it was shown on
 * this corpus and refused zero true paraphrase pairs.
 *
 * Fail-CLOSED: an LLM error, or members that cannot be read, means no merge. An
 * unmerged duplicate is a visible but harmless redundancy; a wrong merge
 * silently destroys a distinct proposal and is what this gate exists to prevent.
 *
 * The cap was 2, i.e. the FIRST two members of each side. On the Bq-VQPMPiG7b
 * production replay that truncation was the snowball vector: a recipient that
 * had already absorbed one merge presented its ORIGINAL pair to the judge, so
 * each successive merge was judged against a stale sample and members drifted
 * two hops from each other — the audited 8-member synthesis held 6 members two
 * independent blind judges called "related, not same". The judge must see the
 * actual sets it is merging.
 */
const MEMBERS_PER_SIDE_FOR_JUDGE = 6;

async function loadMemberStatements(memberIds: string[]): Promise<Statement[]> {
	const ids = memberIds.slice(0, MEMBERS_PER_SIDE_FOR_JUDGE);
	if (ids.length === 0) return [];
	const snaps = await Promise.all(
		ids.map((id) => db().collection(Collections.statements).doc(id).get()),
	);

	return snaps.filter((s) => s.exists).map((s) => s.data() as Statement);
}

async function confirmMergeWithLlm(
	recipient: CandidateSynth,
	donor: CandidateSynth,
	questionContext: string,
): Promise<boolean> {
	try {
		const [recipientMembers, donorMembers] = await Promise.all([
			loadMemberStatements(recipient.members),
			loadMemberStatements(donor.members),
		]);
		// Without a concrete statement from each side there is nothing to judge on,
		// and the titles are exactly what must not decide this.
		if (recipientMembers.length === 0 || donorMembers.length === 0) {
			logger.info('synthesis.reJudge.mergeRefused', {
				recipientId: recipient.doc.statementId,
				donorId: donor.doc.statementId,
				reason: 'members unreadable',
			});

			return false;
		}
		const proposal = await generateSynthesizedProposal(
			[...recipientMembers, ...donorMembers].map((s) => ({
				statementId: s.statementId,
				statement: s.statement,
				paragraphsText: '',
				numberOfEvaluators: s.evaluation?.numberOfEvaluators ?? 0,
				consensus: s.consensus ?? 0,
				sumEvaluations: s.evaluation?.sumEvaluations ?? 0,
			})),
			questionContext,
			{ parentId: recipient.doc.parentId },
		);
		if (proposal.cannotSynthesize === true) {
			logger.info('synthesis.reJudge.mergeRefused', {
				recipientId: recipient.doc.statementId,
				donorId: donor.doc.statementId,
				recipientTitle: recipient.doc.statement?.substring(0, 60),
				donorTitle: donor.doc.statement?.substring(0, 60),
			});

			return false;
		}

		return true;
	} catch (error) {
		logger.warn('synthesis.reJudge: merge confirmation failed, not merging', {
			recipientId: recipient.doc.statementId,
			donorId: donor.doc.statementId,
			error: error instanceof Error ? error.message : String(error),
		});

		return false;
	}
}

/**
 * Anti-snowball transitivity guard.
 *
 * A merge is proposed on the CLOSEST cross-member pair (top-2 average), but the
 * merged set is one proposal only if even its two FARTHEST members are the same
 * proposal. Chained merges fail exactly here: A≈B and B≈C can both hold while
 * A and C are distinct interventions, and the top-pair evidence never looks at
 * A vs C. So before the writer is consulted, the farthest cross-member pair is
 * put to the semantic-equivalence judge (verdict-cached, so re-sweeps are
 * free); anything other than 'same' refuses the merge. Fail-CLOSED: no
 * embeddings, unreadable statements, or a judge error all mean no merge.
 */
async function farthestPairIsSame(
	recipient: CandidateSynth,
	donor: CandidateSynth,
	embeddings: Map<string, number[]>,
): Promise<boolean> {
	let worst: { a: string; b: string; cosine: number } | null = null;
	for (const aId of recipient.members) {
		const aEmb = embeddings.get(aId);
		if (!aEmb) continue;
		for (const bId of donor.members) {
			const bEmb = embeddings.get(bId);
			if (!bEmb) continue;
			const c = cosine(aEmb, bEmb);
			if (!worst || c < worst.cosine) worst = { a: aId, b: bId, cosine: c };
		}
	}
	if (!worst) return false;

	const [aSnap, bSnap] = await Promise.all([
		db().collection(Collections.statements).doc(worst.a).get(),
		db().collection(Collections.statements).doc(worst.b).get(),
	]);
	const aText = aSnap.exists ? (aSnap.data() as Statement).statement : undefined;
	const bText = bSnap.exists ? (bSnap.data() as Statement).statement : undefined;
	if (!aText || !bText) return false;

	const verdicts = await judgeSemanticEquivalence([
		{ pairId: `${worst.a}|${worst.b}`, textA: aText, textB: bText },
	]).catch(() => []);
	const verdict = verdicts[0]?.verdict;
	if (verdict !== 'same') {
		logger.info('synthesis.reJudge.mergeRefused.farthestPair', {
			recipientId: recipient.doc.statementId,
			donorId: donor.doc.statementId,
			farthestCosine: Number(worst.cosine.toFixed(3)),
			verdict: verdict ?? 'judge-error',
		});

		return false;
	}

	return true;
}

function pickMergePair(
	synths: CandidateSynth[],
	embeddings: Map<string, number[]>,
	threshold: number,
	rejectedPairs: Set<string> = new Set(),
): MergeDecision | null {
	let best: MergeDecision | null = null;
	for (let i = 0; i < synths.length; i++) {
		for (let j = i + 1; j < synths.length; j++) {
			const a = synths[i];
			const b = synths[j];
			if (rejectedPairs.has(pairKey(a.doc.statementId, b.doc.statementId))) continue;
			// Compute every cross-member cosine, then take top-2 average.
			// A single high-cosine outlier pair is not enough — vocabulary
			// overlap between distinct ideas can produce one lucky 0.86 pair.
			// Requiring two pairs above threshold is strong evidence that
			// the synths overlap rather than coincidentally vocab-share.
			const crossCosines: number[] = [];
			for (const aMember of a.members) {
				const aEmb = embeddings.get(aMember);
				if (!aEmb) continue;
				for (const bMember of b.members) {
					const bEmb = embeddings.get(bMember);
					if (!bEmb) continue;
					crossCosines.push(cosine(aEmb, bEmb));
				}
			}
			if (crossCosines.length < 2) continue;
			crossCosines.sort((x, y) => y - x);
			const top2Avg = (crossCosines[0] + crossCosines[1]) / 2;
			const pairMax = top2Avg;
			if (pairMax >= threshold) {
				// Pick the larger synth as recipient; tie-break by earlier createdAt.
				const recipientIdx =
					a.members.length > b.members.length
						? i
						: a.members.length < b.members.length
							? j
							: (a.doc.createdAt ?? 0) <= (b.doc.createdAt ?? 0)
								? i
								: j;
				const donorIdx = recipientIdx === i ? j : i;
				if (!best || pairMax > best.bestCosine) {
					best = { recipientIdx, donorIdx, bestCosine: pairMax };
				}
			}
		}
	}

	return best;
}

async function mergeSynths(
	recipient: CandidateSynth,
	donor: CandidateSynth,
	bestCosine: number,
): Promise<void> {
	const recipientRef = db().collection(Collections.statements).doc(recipient.doc.statementId);
	const donorRef = db().collection(Collections.statements).doc(donor.doc.statementId);

	const mergedMembers = Array.from(new Set([...recipient.members, ...donor.members]));
	const now = Date.now();

	await recipientRef.update({
		integratedOptions: mergedMembers,
		lastUpdate: now,
	});
	await donorRef.update({
		hide: true,
		mergedInto: recipient.doc.statementId,
		lastUpdate: now,
	});

	await recordLiveSynthEvent({
		action: 'merge',
		clusterId: recipient.doc.statementId,
		reason: `reJudge merge at cross-member cosine=${bestCosine.toFixed(3)}`,
		prevState: {
			recipientMembers: recipient.members,
			donorClusterId: donor.doc.statementId,
			donorMembers: donor.members,
		},
		newState: {
			integratedOptions: mergedMembers,
			donorHidden: true,
		},
		triggerSource: 'reJudgeSweep',
		parentStatementId: recipient.doc.parentId,
	});

	// Update local cache so the next iteration sees the merged state.
	recipient.members = mergedMembers;
	// Regenerate recipient title now that its membership grew.
	try {
		await enqueueClusterRecompute(
			recipient.doc.statementId,
			'reJudgeSweep:merge',
			recipient.doc.creatorId,
		);
	} catch (error) {
		logger.warn('synthesis.reJudge: enqueueClusterRecompute failed (non-fatal)', {
			recipientId: recipient.doc.statementId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/**
 * Exported so the emulator pump (`functions/scripts/runReJudgeMerge.ts`) can run
 * the REAL sweep rather than a copy of it.
 *
 * The pump used to be a "faithful re-implementation", and it silently stopped
 * being faithful the moment this file gained an LLM merge gate: a certified
 * benchmark run reported zero merge refusals, which read as "the gate approved
 * the bad merges" when in fact the gate never executed. A benchmark that
 * re-implements the code under test measures the copy.
 */
export async function reJudgeProcessParent(
	parentId: string,
	synthDocs: Statement[],
): Promise<{
	merges: number;
}> {
	const parentDoc = await loadParentDoc(parentId);
	const questionContext = parentDoc?.statement ?? parentId;
	const merges = await mergeDuplicateSynths(parentId, synthDocs, questionContext);

	// Second look for statements the live pass left behind. "Topic membership is
	// non-terminal" was a promise without a mechanism: the live pipeline runs once
	// per option AT CREATION, so a statement whose twin (or whose synthesis)
	// arrived later had no path back into the synth passes — measured on the
	// Bq-VQPMPiG7b replay as 11 missed attaches and 5 missed spawn pairs, 19 of
	// 21 of them silent. This pass re-enqueues un-synthesized options whose
	// evidence now clears the synth band, and the queue worker re-runs the FULL
	// judged pipeline on them (same gates, same judges, no new decision path).
	try {
		if (parentDoc) {
			await revisitUnmergedOptions(parentDoc, synthDocs);
		}
	} catch (error) {
		logger.warn('synthesis.reJudge: revisit pass failed (non-fatal)', {
			parentId,
			error: error instanceof Error ? error.message : String(error),
		});
	}

	// Theme-level counterpart of the synth merge above: headings grow one at a
	// time as ideas arrive, so early ones are narrower than the topic they end up
	// representing and nothing else revisits them. Runs unconditionally — it is
	// independent of how many syntheses exist, and gating it behind the synth
	// merge would silently skip it on exactly the questions with few syntheses.
	try {
		const themeResult = await consolidateThemes(parentId, questionContext, 'reJudge');
		if (themeResult.merges > 0) {
			logger.info('synthesis.reJudge.themesConsolidated', {
				parentId,
				merges: themeResult.merges,
				themesBefore: themeResult.themesBefore,
				themesAfter: themeResult.themesAfter,
			});
		}
	} catch (error) {
		logger.warn('synthesis.reJudge: theme consolidation failed (non-fatal)', {
			parentId,
			error: error instanceof Error ? error.message : String(error),
		});
	}

	return { merges };
}

/**
 * The parent (question) doc — the judges' question context and the settings
 * source for the revisit pass. A missing parent degrades the prompt (id used as
 * context) rather than skipping the sweep.
 */
async function loadParentDoc(parentId: string): Promise<Statement | null> {
	try {
		const parentSnap = await db().collection(Collections.statements).doc(parentId).get();

		return parentSnap.exists ? (parentSnap.data() as Statement) : null;
	} catch (error) {
		logger.warn('synthesis.reJudge: parent fetch failed, using id as context', {
			parentId,
			error: error instanceof Error ? error.message : String(error),
		});

		return null;
	}
}

/**
 * How many left-behind options one sweep may re-enqueue per parent. The queue
 * worker re-runs the full pipeline on each, so this bounds the sweep's LLM
 * spend; the highest-evidence candidates go first and the rest wait for the
 * next tick (10 minutes in production).
 */
const MAX_REVISITS_PER_PARENT = 10;
const REVISIT_QUERY_LIMIT = 500;

/**
 * Re-enqueue un-synthesized options whose evidence clears the synth band.
 *
 * An option qualifies when (a) its top-2-average cosine against some synth's
 * members reaches `synthLowerBound` — an attach-shaped miss — or (b) its cosine
 * to another free option reaches `synthLowerBound` — a spawn-shaped miss. The
 * decision stays with the live pipeline's own gates and judges; this pass only
 * restores candidacy.
 *
 * A world fingerprint (synth count + total membership) is stamped on each
 * revisited option so a stable corpus is not re-ground every 10 minutes: an
 * option gets one fresh look per change of the synthesis landscape. The
 * equivalence verdicts the re-run consumes are cached, so repeat looks are
 * near-free; only genuinely new writer consultations pay.
 */
async function revisitUnmergedOptions(parent: Statement, synthDocs: Statement[]): Promise<number> {
	const settings = loadSynthesisSettingsFromStatement(parent);
	const synths: CandidateSynth[] = synthDocs.map((d) => ({
		doc: d,
		members: Array.isArray(d.integratedOptions) ? [...d.integratedOptions] : [],
	}));
	const memberIds = new Set<string>();
	for (const s of synths) for (const m of s.members) memberIds.add(m);
	const worldFp = `s${synths.length}m${memberIds.size}`;

	const snap = await db()
		.collection(Collections.statements)
		.where('parentId', '==', parent.statementId)
		.where('statementType', '==', StatementType.option)
		.limit(REVISIT_QUERY_LIMIT)
		.get();
	const free = snap.docs
		.map((d) => d.data() as Statement)
		.filter(
			(s) =>
				s.isCluster !== true &&
				s.hide !== true &&
				(s.integratedOptions ?? []).length === 0 &&
				!memberIds.has(s.statementId) &&
				(s as unknown as Record<string, unknown>).synthRevisitFp !== worldFp,
		);
	if (free.length === 0) return 0;

	const ids = [...free.map((s) => s.statementId), ...Array.from(memberIds)];
	let embeddings: Map<string, number[]>;
	try {
		embeddings = await embeddingCache.getBatchEmbeddings(ids);
	} catch (error) {
		logger.warn('synthesis.reJudge.revisit: embedding fetch failed', {
			parentId: parent.statementId,
			error: error instanceof Error ? error.message : String(error),
		});

		return 0;
	}

	const band = settings.synthLowerBound;
	const scored: { optionId: string; evidence: number; kind: 'attach' | 'spawn' }[] = [];
	for (const opt of free) {
		const optEmb = embeddings.get(opt.statementId);
		if (!optEmb) continue;
		// (a) attach-shaped: top-2 average against any synth's members.
		let bestSynthEvidence = 0;
		for (const s of synths) {
			const cosines: number[] = [];
			for (const m of s.members) {
				const mEmb = embeddings.get(m);
				if (mEmb) cosines.push(cosine(optEmb, mEmb));
			}
			if (cosines.length < 2) continue;
			cosines.sort((x, y) => y - x);
			const top2 = (cosines[0] + cosines[1]) / 2;
			if (top2 > bestSynthEvidence) bestSynthEvidence = top2;
		}
		// (b) spawn-shaped: best cosine to another free option.
		let bestPairEvidence = 0;
		for (const other of free) {
			if (other.statementId === opt.statementId) continue;
			const oEmb = embeddings.get(other.statementId);
			if (!oEmb) continue;
			const c = cosine(optEmb, oEmb);
			if (c > bestPairEvidence) bestPairEvidence = c;
		}
		const evidence = Math.max(bestSynthEvidence, bestPairEvidence);
		if (evidence >= band) {
			scored.push({
				optionId: opt.statementId,
				evidence,
				kind: bestSynthEvidence >= bestPairEvidence ? 'attach' : 'spawn',
			});
		}
	}
	if (scored.length === 0) return 0;

	scored.sort((a, b) => b.evidence - a.evidence);
	const picked = scored.slice(0, MAX_REVISITS_PER_PARENT);
	let enqueued = 0;
	for (const { optionId, evidence, kind } of picked) {
		try {
			await db()
				.collection(Collections.statements)
				.doc(optionId)
				.update({ synthRevisitFp: worldFp });
			await enqueueItem({
				questionId: parent.statementId,
				kind: 'process-option',
				optionId,
				forceProcess: false,
			});
			enqueued++;
			await recordLiveSynthEvent({
				action: 'revisit',
				clusterId: '',
				optionId,
				reason: `revisit enqueued (${kind}-shaped evidence=${evidence.toFixed(3)} ≥ ${band}, world=${worldFp})`,
				triggerSource: 'reJudgeSweep:revisit',
				parentStatementId: parent.statementId,
			});
		} catch (error) {
			logger.warn('synthesis.reJudge.revisit: enqueue failed', {
				optionId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
	if (enqueued > 0) {
		logger.info('synthesis.reJudge.revisit', {
			parentId: parent.statementId,
			candidates: scored.length,
			enqueued,
			worldFp,
		});
	}

	return enqueued;
}

async function mergeDuplicateSynths(
	parentId: string,
	synthDocs: Statement[],
	questionContext: string,
): Promise<number> {
	if (synthDocs.length < 2) return 0;

	const synths: CandidateSynth[] = synthDocs.map((d) => ({
		doc: d,
		members: Array.isArray(d.integratedOptions) ? [...d.integratedOptions] : [],
	}));

	// Batch-fetch every member's embedding across all synths in this parent.
	const allMemberIds = new Set<string>();
	for (const s of synths) for (const m of s.members) allMemberIds.add(m);
	if (allMemberIds.size === 0) return 0;

	let embeddings: Map<string, number[]> | undefined;
	try {
		embeddings = await embeddingCache.getBatchEmbeddings(Array.from(allMemberIds));
	} catch (error) {
		logger.warn('synthesis.reJudge: embedding batch fetch failed', {
			parentId,
			memberCount: allMemberIds.size,
			error: error instanceof Error ? error.message : String(error),
		});

		return 0;
	}
	if (!embeddings || typeof embeddings.get !== 'function') return 0;

	const threshold = REJUDGE_MERGE_THRESHOLD;
	let merges = 0;
	// Loop: find best merge pair, perform it, repeat. Each merge shrinks the
	// synth list; recompute pairs each iteration so freshly-merged recipients
	// can attract further donors.
	const rejectedPairs = new Set<string>();
	while (merges < MAX_MERGES_PER_PARENT && synths.length >= 2) {
		const decision = pickMergePair(synths, embeddings, threshold, rejectedPairs);
		if (!decision) break;
		const recipient = synths[decision.recipientIdx];
		const donor = synths[decision.donorIdx];

		// Cosine got us a candidate; the LLM decides. Merging two clusters is
		// expensive and effectively irreversible for the reader, and cosine
		// provably cannot tell "two wordings of one proposal" from "two distinct
		// proposals about the same thing" — the two bands overlap at 0.82-0.86.
		// At most MAX_MERGES_PER_PARENT calls per parent per sweep.
		// The cheap cached check runs first: the FARTHEST cross-member pair must
		// itself be 'same', or the merged set cannot be one proposal (the
		// transitivity failure behind the audited 8-member snowball).
		const transitive = await farthestPairIsSame(recipient, donor, embeddings);
		if (!transitive) {
			rejectedPairs.add(pairKey(recipient.doc.statementId, donor.doc.statementId));
			continue;
		}
		const confirmed = await confirmMergeWithLlm(recipient, donor, questionContext);
		if (!confirmed) {
			rejectedPairs.add(pairKey(recipient.doc.statementId, donor.doc.statementId));
			continue;
		}

		await mergeSynths(recipient, donor, decision.bestCosine);
		synths.splice(decision.donorIdx, 1);
		merges++;
	}

	return merges;
}

export const fn_synthesisReJudge = onSchedule(
	{
		schedule: 'every 10 minutes',
		timeZone: 'UTC',
		...functionConfig,
		timeoutSeconds: 540,
		memory: '1GiB',
	},
	async () => {
		const startedAt = Date.now();
		try {
			// Fetch up to SYNTH_QUERY_LIMIT non-hidden synth docs and group by
			// parentId. Collection-group scope on parentId avoids needing a
			// composite index dedicated to this sweep.
			const snap = await db()
				.collection(Collections.statements)
				.where('derivedByPipeline', '==', 'synthesis')
				.where('hide', '==', false)
				.limit(SYNTH_QUERY_LIMIT)
				.get();
			if (snap.empty) return;

			const byParent = new Map<string, Statement[]>();
			for (const doc of snap.docs) {
				const s = doc.data() as Statement;
				const list = byParent.get(s.parentId) ?? [];
				list.push(s);
				byParent.set(s.parentId, list);
			}

			let totalMerges = 0;
			let parentsProcessed = 0;
			for (const [parentId, synths] of byParent) {
				if (parentsProcessed >= MAX_PARENTS_PER_SWEEP) break;
				if (synths.length < 2) continue;
				parentsProcessed++;
				try {
					const result = await reJudgeProcessParent(parentId, synths);
					totalMerges += result.merges;
					if (result.merges > 0) {
						logger.info('synthesis.reJudge.parent', {
							parentId,
							inputSynths: synths.length,
							merges: result.merges,
						});
					}
				} catch (error) {
					logger.warn('synthesis.reJudge: parent processing failed', {
						parentId,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}

			logger.info('synthesis.reJudge.summary', {
				parentsProcessed,
				totalMerges,
				durationMs: Date.now() - startedAt,
			});
		} catch (error) {
			logger.error('synthesis.reJudge: sweep failed', {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	},
);
