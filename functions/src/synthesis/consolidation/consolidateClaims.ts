import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, type Statement } from '@freedi/shared-types';
import { callLLM, extractJson, WORKER_MODEL } from '../../config/openai-chat';
import { loadClaims, type ClusterClaim } from '../../services/claim-registry-service';
import { logError } from '../../utils/errorHandling';
import { recordLiveSynthEvent } from '../liveSynth/auditLog';
import { enqueueClusterRecompute } from '../liveSynth/clusterRecompute';

/**
 * Continuous claim-level consolidation (docs/architecture/CLAIM_REGISTRY.md §2.3).
 *
 * Bulk re-clustering is expensive because it operates on N statements. The
 * registry gives re-clustering a compact substrate: a question with hundreds
 * of statements has a few dozen claims of 5–15 words, so ONE LLM call can read
 * the whole codebook and propose merges. Membership transfers transitively on
 * merge (A expresses X, X ≡ Y ⇒ A expresses Y) — no per-statement re-judging.
 *
 * v1 scope: merges auto-apply; "too broad" (split) proposals are routed to the
 * admin review queue rather than auto-split — a bad merge is recoverable by a
 * later split decision, a bad split scatters members.
 *
 * Cadence: every CONSOLIDATION_INTERVAL processed statements per question,
 * tracked in the `_claimRegistry/{questionId}` meta doc.
 */

const CONSOLIDATION_INTERVAL = 15;
const META_COLLECTION = '_claimRegistry';
const REVIEW_COLLECTION = '_liveSynthCandidates';
/** Provisional → confirmed once a cluster has this many members and survived a pass. */
const CONFIRM_MIN_MEMBERS = 3;

function db() {
	return getFirestore();
}

/**
 * Count a processed statement; returns true when a consolidation pass is due
 * (counter reached the interval and was reset). Transactional so concurrent
 * pipeline runs don't double-fire.
 */
export async function noteStatementProcessed(questionId: string): Promise<boolean> {
	const ref = db().collection(META_COLLECTION).doc(questionId);
	try {
		return await db().runTransaction(async (tx) => {
			const snap = await tx.get(ref);
			const current = snap.exists
				? ((snap.data() as { statementsSinceConsolidation?: number })
						.statementsSinceConsolidation ?? 0)
				: 0;
			const next = current + 1;
			if (next >= CONSOLIDATION_INTERVAL) {
				tx.set(
					ref,
					{ statementsSinceConsolidation: 0, lastConsolidationAt: Date.now() },
					{ merge: true },
				);

				return true;
			}
			tx.set(ref, { statementsSinceConsolidation: next }, { merge: true });

			return false;
		});
	} catch (error) {
		logError(error, {
			operation: 'claimRegistry.noteStatementProcessed',
			statementId: questionId,
		});

		return false;
	}
}

interface ConsolidationProposal {
	merges: Array<{ keep: number; absorb: number }>;
	tooBroad: number[];
}

const CONSOLIDATE_SYSTEM = `You review the canonical claims of a public deliberation question and propose consolidation. Claims may be in any language; judge meaning, not wording.

- "merges": pairs of claims that mean essentially the SAME thing (their authors would agree). {"keep": <index of the better-worded claim>, "absorb": <index of the duplicate>}. Only propose a merge when the claims are interchangeable — same-topic-different-action is NOT a merge.
- "tooBroad": indices of claims so broad they cover several distinct proposals and should be reviewed for splitting.

Be conservative: no merges and no tooBroad flags is a perfectly good answer.

Respond with JSON only: {"merges": [{"keep": <1-based>, "absorb": <1-based>}], "tooBroad": [<1-based>]}`;

async function proposeConsolidation(
	questionText: string,
	claims: ClusterClaim[],
): Promise<ConsolidationProposal> {
	const empty: ConsolidationProposal = { merges: [], tooBroad: [] };
	if (claims.length < 2) return empty;
	try {
		const list = claims
			.map((c, i) => `${i + 1}. ${c.canonicalClaim} (${c.memberCount} statements)`)
			.join('\n');
		const text = await callLLM({
			model: WORKER_MODEL,
			system: CONSOLIDATE_SYSTEM,
			user: `Question: "${questionText}"\n\nClaims:\n${list}\n\nRespond with the JSON object.`,
			temperature: 0,
			maxTokens: 500,
			jsonMode: true,
		});
		const parsed = JSON.parse(extractJson(text)) as {
			merges?: unknown;
			tooBroad?: unknown;
		};
		const merges: Array<{ keep: number; absorb: number }> = [];
		const usedIndices = new Set<number>();
		if (Array.isArray(parsed.merges)) {
			for (const entry of parsed.merges) {
				const m = entry as { keep?: unknown; absorb?: unknown };
				if (typeof m.keep !== 'number' || typeof m.absorb !== 'number') continue;
				const keep = m.keep - 1;
				const absorb = m.absorb - 1;
				if (keep === absorb) continue;
				if (keep < 0 || keep >= claims.length || absorb < 0 || absorb >= claims.length) continue;
				// Each cluster participates in at most one merge per pass — chained
				// merges settle over successive passes instead of racing in one.
				if (usedIndices.has(keep) || usedIndices.has(absorb)) continue;
				usedIndices.add(keep);
				usedIndices.add(absorb);
				merges.push({ keep, absorb });
			}
		}
		const tooBroad: number[] = [];
		if (Array.isArray(parsed.tooBroad)) {
			for (const entry of parsed.tooBroad) {
				if (typeof entry !== 'number') continue;
				const idx = entry - 1;
				if (idx < 0 || idx >= claims.length) continue;
				if (usedIndices.has(idx)) continue;
				tooBroad.push(idx);
			}
		}

		return { merges, tooBroad };
	} catch (error) {
		logError(error, {
			operation: 'claimRegistry.proposeConsolidation',
			metadata: { claimCount: claims.length },
		});

		return empty;
	}
}

/**
 * Merge `source` into `target`: union members, hide the source cluster. The
 * target keeps its claim unchanged (merge means X ≡ Y — no meaning change, no
 * member re-validation needed).
 */
async function mergeClusters(
	targetId: string,
	sourceId: string,
	triggerSource: string,
): Promise<boolean> {
	try {
		const [targetSnap, sourceSnap] = await db().getAll(
			db().collection(Collections.statements).doc(targetId),
			db().collection(Collections.statements).doc(sourceId),
		);
		if (!targetSnap.exists || !sourceSnap.exists) return false;
		const target = targetSnap.data() as Statement;
		const source = sourceSnap.data() as Statement;
		if (target.isCluster !== true || source.isCluster !== true) return false;
		if (target.hide === true || source.hide === true) return false;

		const targetMembers = target.integratedOptions ?? [];
		const sourceMembers = source.integratedOptions ?? [];
		const merged = [...targetMembers, ...sourceMembers.filter((m) => !targetMembers.includes(m))];
		const now = Date.now();

		await db().collection(Collections.statements).doc(targetId).update({
			integratedOptions: merged,
			lastUpdate: now,
		});
		await db().collection(Collections.statements).doc(sourceId).update({
			hide: true,
			lastUpdate: now,
		});

		logger.info('claimRegistry.consolidation.merge', {
			targetId,
			sourceId,
			targetMembersBefore: targetMembers.length,
			mergedMemberCount: merged.length,
		});

		await recordLiveSynthEvent({
			action: 'attach',
			clusterId: targetId,
			optionId: sourceId,
			reason: 'claim consolidation merge (claims are equivalent)',
			prevState: { integratedOptions: targetMembers, absorbedCluster: sourceId },
			newState: { integratedOptions: merged },
			triggerSource,
			parentStatementId: target.parentId,
		});

		await enqueueClusterRecompute(targetId, `${triggerSource}:consolidation-merge`, '');

		return true;
	} catch (error) {
		logError(error, {
			operation: 'claimRegistry.mergeClusters',
			metadata: { targetId, sourceId },
		});

		return false;
	}
}

async function flagTooBroadForReview(claim: ClusterClaim, questionId: string): Promise<void> {
	try {
		await db()
			.collection(REVIEW_COLLECTION)
			.add({
				kind: 'claim-too-broad',
				optionId: claim.clusterId,
				siblingId: '',
				parentId: questionId,
				similarity: 0,
				reason: `claim flagged too broad by consolidation: "${claim.canonicalClaim}"`,
				createdAt: Date.now(),
			});
	} catch (error) {
		logError(error, {
			operation: 'claimRegistry.flagTooBroadForReview',
			statementId: claim.clusterId,
		});
	}
}

async function confirmMatureClaims(claims: ClusterClaim[], excluded: Set<string>): Promise<void> {
	for (const claim of claims) {
		if (excluded.has(claim.clusterId)) continue;
		if (claim.claimStatus !== 'provisional') continue;
		if (claim.memberCount < CONFIRM_MIN_MEMBERS) continue;
		try {
			await db().collection(Collections.statements).doc(claim.clusterId).update({
				claimStatus: 'confirmed',
				lastUpdate: Date.now(),
			});
		} catch (error) {
			logError(error, {
				operation: 'claimRegistry.confirmMatureClaims',
				statementId: claim.clusterId,
			});
		}
	}
}

export interface ConsolidationResult {
	claimCount: number;
	mergesApplied: number;
	flaggedTooBroad: number;
}

/** One consolidation pass over the question's claim codebook. */
export async function runConsolidation(
	questionId: string,
	questionText: string,
): Promise<ConsolidationResult> {
	const claims = await loadClaims(questionId);
	const result: ConsolidationResult = {
		claimCount: claims.length,
		mergesApplied: 0,
		flaggedTooBroad: 0,
	};
	if (claims.length === 0) return result;

	const proposal = await proposeConsolidation(questionText, claims);
	const touched = new Set<string>();

	for (const merge of proposal.merges) {
		const keep = claims[merge.keep];
		const absorb = claims[merge.absorb];
		const ok = await mergeClusters(keep.clusterId, absorb.clusterId, 'claim-consolidation');
		if (ok) {
			result.mergesApplied++;
			touched.add(keep.clusterId);
			touched.add(absorb.clusterId);
		}
	}

	for (const idx of proposal.tooBroad) {
		const claim = claims[idx];
		await flagTooBroadForReview(claim, questionId);
		result.flaggedTooBroad++;
		touched.add(claim.clusterId);
	}

	// Surviving the pass untouched is the "survived one consolidation" half of
	// the provisional → confirmed transition; member count is the other half.
	await confirmMatureClaims(claims, touched);

	logger.info('claimRegistry.consolidation.done', { questionId, ...result });

	return result;
}

export const __INTERNAL = { CONSOLIDATION_INTERVAL, CONFIRM_MIN_MEMBERS };
