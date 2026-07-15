import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, type Statement } from '@freedi/shared-types';
import { callLLM, extractJson, WORKER_MODEL } from '../config/openai-chat';
import { logError } from '../utils/errorHandling';

/**
 * Claim registry — canonical labeling for clusters.
 *
 * Every cluster (synth or topic-cluster) carries a short canonical claim
 * (5–15 words) plus a plain-language public explanation. New options that the
 * cosine passes can't place are classified by an LLM against the FULL list of
 * claims for the question, making recall independent of embedding geometry
 * (the "same meaning, distant embeddings" gap).
 *
 * Canonicalization is classification against a shared codebook, NOT free-form
 * generation — classification into a growing label set converges; independent
 * generation does not.
 *
 * See docs/architecture/CLAIM_REGISTRY.md for the full design.
 */

// ---------------------------------------------------------------------------
// Data model — extra fields on cluster Statement docs (same pattern as the
// `synthesis` settings block: @freedi/shared-types is a packaged tgz, so
// registry fields are read through typed helpers rather than the shared schema)
// ---------------------------------------------------------------------------

export type ClaimStatus = 'provisional' | 'confirmed';

export interface ClaimFields {
	canonicalClaim: string;
	publicExplanation: string;
	claimVersion: number;
	claimStatus: ClaimStatus;
	claimUpdatedAt: number;
}

export interface ClusterClaim extends ClaimFields {
	clusterId: string;
	isSynth: boolean;
	memberCount: number;
}

/** Read registry fields off a cluster doc; null when the cluster has no claim yet. */
export function readClaimFields(cluster: Statement): ClaimFields | null {
	const raw = cluster as unknown as Record<string, unknown>;
	const canonicalClaim = raw['canonicalClaim'];
	if (typeof canonicalClaim !== 'string' || canonicalClaim.trim().length === 0) return null;

	return {
		canonicalClaim,
		publicExplanation: typeof raw['publicExplanation'] === 'string' ? raw['publicExplanation'] : '',
		claimVersion: typeof raw['claimVersion'] === 'number' ? raw['claimVersion'] : 1,
		claimStatus: raw['claimStatus'] === 'confirmed' ? 'confirmed' : 'provisional',
		claimUpdatedAt: typeof raw['claimUpdatedAt'] === 'number' ? raw['claimUpdatedAt'] : 0,
	};
}

/** Initial claim fields stamped on a freshly spawned cluster. */
export function claimFieldsForSpawn(claim: string, explanation: string): ClaimFields {
	return {
		canonicalClaim: claim,
		publicExplanation: explanation,
		claimVersion: 1,
		claimStatus: 'provisional',
		claimUpdatedAt: Date.now(),
	};
}

function db() {
	return getFirestore();
}

/**
 * Load the claim codebook for a question: every live cluster under the parent,
 * with its canonical claim (falling back to the cluster title for clusters that
 * predate the registry — the first-run backfill replaces these).
 */
export async function loadClaims(questionId: string): Promise<ClusterClaim[]> {
	try {
		const snap = await db()
			.collection(Collections.statements)
			.where('parentId', '==', questionId)
			.get();

		const claims: ClusterClaim[] = [];
		for (const doc of snap.docs) {
			const statement = doc.data() as Statement;
			if (statement.isCluster !== true) continue;
			if (statement.hide === true) continue;
			const members = statement.integratedOptions ?? [];
			if (members.length === 0) continue;
			const fields = readClaimFields(statement) ?? {
				canonicalClaim: statement.statement ?? '',
				publicExplanation: statement.description ?? '',
				claimVersion: 0,
				claimStatus: 'provisional' as ClaimStatus,
				claimUpdatedAt: 0,
			};
			if (!fields.canonicalClaim) continue;
			claims.push({
				...fields,
				clusterId: statement.statementId,
				isSynth: statement.derivedByPipeline === 'synthesis',
				memberCount: members.length,
			});
		}

		return claims;
	} catch (error) {
		logError(error, {
			operation: 'claimRegistry.loadClaims',
			statementId: questionId,
		});

		return [];
	}
}

// ---------------------------------------------------------------------------
// Classification: which existing claim does a statement express?
// ---------------------------------------------------------------------------

export type ClaimRelation = 'expresses' | 'opposes' | 'none';

export interface ClaimClassification {
	/** Matched cluster, only when relation === 'expresses'. */
	matchedClusterId: string | null;
	relation: ClaimRelation;
	confidence: number;
	reason: string;
}

const NO_MATCH: ClaimClassification = {
	matchedClusterId: null,
	relation: 'none',
	confidence: 0,
	reason: '',
};

const CLASSIFY_SYSTEM = `You classify a citizen's statement against a list of canonical claims from the same deliberation question. Statements may be in any language (including Hebrew and Arabic); judge meaning, not wording.

Rules:
- "expresses": the statement proposes essentially the SAME thing as one claim — its author would agree the claim states their idea. Different vocabulary, framing, or sentence structure does NOT matter; identical MEANING does.
- "opposes": the statement contradicts a claim (proposes the opposite action on the same subject). Report the opposed claim but it is NOT a match.
- "none": the statement proposes something no listed claim covers, or only shares a topic with a claim while proposing a different action/stance/magnitude.
- When in doubt between "expresses" and "none", answer "none".

Respond with JSON only:
{"matchIndex": <1-based index or null>, "relation": "expresses" | "opposes" | "none", "confidence": <0..1>, "reason": "<brief>"}`;

/**
 * One LLM call over the FULL codebook — recall independent of cosine geometry.
 * Fails closed (no match) so an LLM outage degrades to today's behavior.
 */
export async function classifyAgainstClaims(input: {
	statementText: string;
	questionText: string;
	claims: ClusterClaim[];
}): Promise<ClaimClassification> {
	const { statementText, questionText, claims } = input;
	if (claims.length === 0 || !statementText.trim()) return { ...NO_MATCH };

	const claimList = claims.map((c, idx) => `${idx + 1}. ${c.canonicalClaim}`).join('\n');
	const user = `Question: "${questionText}"

Existing claims:
${claimList}

New statement: "${statementText}"

Which claim (if any) does the new statement express? Respond with the JSON object.`;

	try {
		const text = await callLLM({
			model: WORKER_MODEL,
			system: CLASSIFY_SYSTEM,
			user,
			temperature: 0,
			maxTokens: 300,
			jsonMode: true,
		});
		const parsed = JSON.parse(extractJson(text)) as {
			matchIndex?: unknown;
			relation?: unknown;
			confidence?: unknown;
			reason?: unknown;
		};

		const relation: ClaimRelation =
			parsed.relation === 'expresses' || parsed.relation === 'opposes' ? parsed.relation : 'none';
		const idx = typeof parsed.matchIndex === 'number' ? parsed.matchIndex - 1 : -1;
		const matched = relation === 'expresses' && idx >= 0 && idx < claims.length;

		return {
			matchedClusterId: matched ? claims[idx].clusterId : null,
			relation: matched ? 'expresses' : relation === 'opposes' ? 'opposes' : 'none',
			confidence:
				typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
					? Math.max(0, Math.min(1, parsed.confidence))
					: 0,
			reason: typeof parsed.reason === 'string' ? parsed.reason : '',
		};
	} catch (error) {
		logError(error, {
			operation: 'claimRegistry.classifyAgainstClaims',
			metadata: { claimCount: claims.length },
		});

		return { ...NO_MATCH };
	}
}

// ---------------------------------------------------------------------------
// Claim generation (spawn of singletons, first-run backfill)
// ---------------------------------------------------------------------------

export interface GeneratedClaim {
	canonicalClaim: string;
	publicExplanation: string;
}

const GENERATE_SYSTEM = `You write canonical claims for a public deliberation platform. Given a question and one or more statements proposing the same idea, produce:
- "canonicalClaim": the core proposal in 5-15 words, neutral, present tense, no rhetoric. Same language as the statements.
- "publicExplanation": 1-2 plain-language sentences explaining the proposal to the general public. Same language as the statements.

Respond with JSON only: {"canonicalClaim": "...", "publicExplanation": "..."}`;

/** Fails open: returns a truncation of the source text so callers can proceed. */
export async function generateClaim(input: {
	questionText: string;
	texts: string[];
}): Promise<GeneratedClaim> {
	const { questionText, texts } = input;
	const fallback: GeneratedClaim = {
		canonicalClaim: (texts[0] ?? '').slice(0, 120),
		publicExplanation: '',
	};
	if (texts.length === 0 || !texts[0]?.trim()) return fallback;

	try {
		const user = `Question: "${questionText}"

Statements:
${texts.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Respond with the JSON object.`;
		const text = await callLLM({
			model: WORKER_MODEL,
			system: GENERATE_SYSTEM,
			user,
			temperature: 0,
			maxTokens: 300,
			jsonMode: true,
		});
		const parsed = JSON.parse(extractJson(text)) as {
			canonicalClaim?: unknown;
			publicExplanation?: unknown;
		};
		if (typeof parsed.canonicalClaim !== 'string' || !parsed.canonicalClaim.trim()) {
			return fallback;
		}

		return {
			canonicalClaim: parsed.canonicalClaim.trim(),
			publicExplanation:
				typeof parsed.publicExplanation === 'string' ? parsed.publicExplanation.trim() : '',
		};
	} catch (error) {
		logError(error, {
			operation: 'claimRegistry.generateClaim',
			metadata: { textCount: texts.length },
		});

		return fallback;
	}
}

// ---------------------------------------------------------------------------
// Mutation protocol — classify a claim-text change, revalidate members
// ---------------------------------------------------------------------------

/**
 * How a claim's meaning moved when its text changed. Drives whether members
 * must be re-validated (see docs/architecture/CLAIM_REGISTRY.md §3):
 *   reword / broaden → members stay; narrow / different → batched re-validation.
 */
export type ClaimChangeType = 'reword' | 'broaden' | 'narrow' | 'different';

const CHANGE_SYSTEM = `You compare an OLD and NEW wording of a canonical claim from a deliberation platform and classify how the MEANING changed:
- "reword": same meaning, different words.
- "broaden": the new wording generalizes the old — everything the old claim covered is still covered.
- "narrow": the new wording covers strictly less than the old.
- "different": the meaning shifted to something else.

Respond with JSON only: {"change": "reword" | "broaden" | "narrow" | "different"}`;

/** Fails closed to 'different' — the safe direction (forces re-validation). */
export async function classifyClaimChange(
	oldClaim: string,
	newClaim: string,
): Promise<ClaimChangeType> {
	if (oldClaim.trim() === newClaim.trim()) return 'reword';
	try {
		const text = await callLLM({
			model: WORKER_MODEL,
			system: CHANGE_SYSTEM,
			user: `OLD: "${oldClaim}"\nNEW: "${newClaim}"\n\nRespond with the JSON object.`,
			temperature: 0,
			maxTokens: 60,
			jsonMode: true,
		});
		const parsed = JSON.parse(extractJson(text)) as { change?: unknown };
		if (
			parsed.change === 'reword' ||
			parsed.change === 'broaden' ||
			parsed.change === 'narrow' ||
			parsed.change === 'different'
		) {
			return parsed.change;
		}

		return 'different';
	} catch (error) {
		logError(error, {
			operation: 'claimRegistry.classifyClaimChange',
		});

		return 'different';
	}
}

export interface MemberBrief {
	statementId: string;
	/** Compact representation: embeddingBrief when present, else statement title. */
	brief: string;
}

export interface RevalidationResult {
	validIds: string[];
	detachedIds: string[];
}

const REVALIDATE_SYSTEM = `A canonical claim on a deliberation platform changed its meaning. You receive the NEW claim and the cluster's member statements (as short briefs). Decide which members still EXPRESS the new claim (same meaning; wording irrelevant).

Respond with JSON only: {"validIndices": [<1-based indices of members that still express the claim>]}`;

/**
 * ONE batched call per cluster (members are 5–15-word briefs), not one per
 * member. Fails open (all members kept) — an LLM outage must not scatter a
 * cluster.
 */
export async function revalidateMembers(
	newClaim: string,
	members: MemberBrief[],
): Promise<RevalidationResult> {
	const allValid: RevalidationResult = {
		validIds: members.map((m) => m.statementId),
		detachedIds: [],
	};
	if (members.length === 0) return allValid;

	try {
		const list = members.map((m, i) => `${i + 1}. ${m.brief}`).join('\n');
		const text = await callLLM({
			model: WORKER_MODEL,
			system: REVALIDATE_SYSTEM,
			user: `NEW claim: "${newClaim}"\n\nMembers:\n${list}\n\nRespond with the JSON object.`,
			temperature: 0,
			maxTokens: 300,
			jsonMode: true,
		});
		const parsed = JSON.parse(extractJson(text)) as { validIndices?: unknown };
		if (!Array.isArray(parsed.validIndices)) return allValid;
		const valid = new Set<number>();
		for (const entry of parsed.validIndices) {
			if (typeof entry === 'number' && entry >= 1 && entry <= members.length) {
				valid.add(entry - 1);
			}
		}

		return {
			validIds: members.filter((_, i) => valid.has(i)).map((m) => m.statementId),
			detachedIds: members.filter((_, i) => !valid.has(i)).map((m) => m.statementId),
		};
	} catch (error) {
		logError(error, {
			operation: 'claimRegistry.revalidateMembers',
			metadata: { memberCount: members.length },
		});

		return allValid;
	}
}

// ---------------------------------------------------------------------------
// Decision log — the measurement layer. A registry match at low cosine is the
// "same meaning, distant embeddings" case; the log both quantifies how often
// it happens and accumulates labeled pairs for a future embedding fine-tune.
// ---------------------------------------------------------------------------

export function logRegistryDecision(decision: {
	questionId: string;
	optionId: string;
	method: 'registry' | 'cosine';
	matchedClusterId: string | null;
	cosineAtMatch: number | null;
	relation: ClaimRelation;
	confidence: number;
	claimCount: number;
}): void {
	logger.info('claimRegistry.decision', decision);
}
