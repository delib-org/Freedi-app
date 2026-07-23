import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, type Statement } from '@freedi/shared-types';
import { callLLM, extractJson, TAXONOMY_MODEL, WORKER_MODEL } from '../config/openai-chat';
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

/**
 * Broaden-ratchet anchor (mutation protocol). Individual "broaden" changes are
 * safe without re-validation, but broadens COMPOSE: several small generalizations
 * can move a claim's meaning substantially with zero member checks along the way.
 * The anchor is the last wording the members were actually validated against;
 * after MAX_UNCHECKED_BROADENS consecutive broadens the new wording is compared
 * to the anchor directly, breaking the ratchet.
 */
export interface ClaimAnchorFields {
	claimAnchorText: string;
	claimBroadensSinceAnchor: number;
}

// ---------------------------------------------------------------------------
// Hierarchy (plans/claim-registry-hierarchy-plan.md, Phase 1 — data model only)
//
// Two levels: 'topic' claims are themes that organize 'specific' claims;
// statements only ever attach to specific claims — a topic is a routing and
// roll-up node, never an attach target. No production code creates topic
// claims yet (Phase 3 grows them via consolidation splits / crowding); until
// then every claim is 'specific' and behavior is unchanged.
// ---------------------------------------------------------------------------

export type ClaimLevel = 'topic' | 'specific';

export interface ClaimHierarchyFields {
	/** Topic-level claim this claim sits under; null = root/uncategorized. */
	parentClaimId: string | null;
	claimLevel: ClaimLevel;
	/** Denormalized children of a topic claim (empty for specific claims). */
	childClaimIds: string[];
}

/** Read hierarchy fields off a cluster doc; absent fields get safe defaults. */
export function readClaimHierarchy(cluster: Statement): ClaimHierarchyFields {
	const raw = cluster as unknown as Record<string, unknown>;

	return {
		parentClaimId: typeof raw['parentClaimId'] === 'string' ? raw['parentClaimId'] : null,
		claimLevel: raw['claimLevel'] === 'topic' ? 'topic' : 'specific',
		childClaimIds: Array.isArray(raw['childClaimIds'])
			? (raw['childClaimIds'] as unknown[]).filter((id): id is string => typeof id === 'string')
			: [],
	};
}

/** Statements attach only to specific claims; topics organize, never hold members. */
export function isAttachTarget(claim: Pick<ClusterClaim, 'claimLevel'>): boolean {
	return claim.claimLevel !== 'topic';
}

export interface ClusterClaim extends ClaimFields {
	clusterId: string;
	isSynth: boolean;
	memberCount: number;
	/**
	 * A representative full-text statement for the claim (the cluster's own
	 * synthesized/title text). Shown to the classifier alongside the canonical
	 * claim: the 5–15-word canonical alone loses stance nuance (benchmarked at
	 * −25pp triplet accuracy — see scientific-research/20206-07-16-Claim-regestry),
	 * and the exemplar restores what compression drops.
	 */
	exemplar?: string;
	/** Hierarchy level; absent means 'specific' (every claim today). */
	claimLevel?: ClaimLevel;
	/** Topic this claim sits under; absent/null = root. */
	parentClaimId?: string | null;
}

/** Max exemplar characters rendered into the classification prompt. */
const EXEMPLAR_MAX_CHARS = 180;

/**
 * One codebook line for an LLM prompt: canonical claim, plus the public
 * explanation and a truncated exemplar when they add information.
 */
export function renderClaimLine(claim: ClusterClaim, index: number): string {
	let line = `${index + 1}. ${claim.canonicalClaim}`;
	if (claim.publicExplanation && claim.publicExplanation !== claim.canonicalClaim) {
		line += ` — ${claim.publicExplanation}`;
	}
	const exemplar = claim.exemplar?.trim();
	if (exemplar && exemplar !== claim.canonicalClaim) {
		line += ` (e.g.: "${exemplar.slice(0, EXEMPLAR_MAX_CHARS)}")`;
	}

	return line;
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
export function claimFieldsForSpawn(
	claim: string,
	explanation: string,
): ClaimFields & ClaimAnchorFields & ClaimHierarchyFields {
	return {
		canonicalClaim: claim,
		publicExplanation: explanation,
		claimVersion: 1,
		claimStatus: 'provisional',
		claimUpdatedAt: Date.now(),
		claimAnchorText: claim,
		claimBroadensSinceAnchor: 0,
		// Hierarchy defaults: every spawned claim is a root-level specific claim
		// until topic routing (hierarchy plan Phase 2/3) places it.
		parentClaimId: null,
		claimLevel: 'specific',
		childClaimIds: [],
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
			const hierarchy = readClaimHierarchy(statement);
			claims.push({
				...fields,
				clusterId: statement.statementId,
				isSynth: statement.derivedByPipeline === 'synthesis',
				memberCount: members.length,
				// The cluster's own text (synthesized statement / title) as exemplar —
				// no extra reads; renderClaimLine drops it when it adds nothing.
				exemplar: statement.statement ?? undefined,
				claimLevel: hierarchy.claimLevel,
				parentClaimId: hierarchy.parentClaimId,
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
	/**
	 * Contradicted cluster, only when relation === 'opposes'. Never an attach
	 * target — but "claim X has counter-statements" is exactly the pro/con
	 * structure synthesis wants, so the edge is preserved instead of discarded.
	 */
	opposedClusterId: string | null;
	relation: ClaimRelation;
	confidence: number;
	reason: string;
	/**
	 * True when the LLM call itself failed (outage, exhausted rate-limit
	 * retries) and the "none" is a degraded default, NOT a judgment. Without
	 * this, a saturated TPM ceiling looks like a burst of honest "new claim"
	 * verdicts — silent classifier corruption the decision log can't see.
	 */
	failedClosed?: boolean;
}

const NO_MATCH: ClaimClassification = {
	matchedClusterId: null,
	opposedClusterId: null,
	relation: 'none',
	confidence: 0,
	reason: '',
};

/**
 * Order the codebook for the classification prompt: LLMs have position bias in
 * long in-context lists (entries buried mid-list are under-matched), so the most
 * plausible candidates go first. Cosine evidence — where geometry produced any —
 * is a good plausibility ranker even when it is a poor gatekeeper; clusters
 * without evidence are ranked by member count (larger claims are the likelier
 * match a priori). Pure reorder: never adds or drops claims.
 */
export function orderClaimsForClassification(
	claims: ClusterClaim[],
	cosineByCluster: ReadonlyMap<string, number>,
): ClusterClaim[] {
	return [...claims].sort((a, b) => {
		const cosA = cosineByCluster.get(a.clusterId) ?? -1;
		const cosB = cosineByCluster.get(b.clusterId) ?? -1;
		if (cosA !== cosB) return cosB - cosA;

		return b.memberCount - a.memberCount;
	});
}

const CLASSIFY_SYSTEM = `You classify a citizen's statement against a list of canonical claims from the same deliberation question. Statements may be in any language (including Hebrew and Arabic); judge meaning, not wording.

Each claim line gives the canonical claim, and may add a plain-language explanation after "—" and an example member statement in (e.g.: "..."). Use the explanation and example to judge the claim's PRECISE meaning — the short canonical wording alone can under-specify it.
CAUTION: a statement may reuse an example's exact wording while taking the OPPOSITE stance (e.g. an inserted "not", a swapped verb). Shared phrasing is never evidence of a match — judge stance and meaning only.

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
	/** Model override — used by the sampled second-model audit (defaults to WORKER_MODEL). */
	model?: string;
}): Promise<ClaimClassification> {
	const { statementText, questionText, claims } = input;
	if (claims.length === 0 || !statementText.trim()) return { ...NO_MATCH };

	const claimList = claims.map((c, idx) => renderClaimLine(c, idx)).join('\n');
	const user = `Question: "${questionText}"

Existing claims:
${claimList}

New statement: "${statementText}"

Which claim (if any) does the new statement express? Respond with the JSON object.`;

	try {
		const text = await callLLM({
			model: input.model ?? WORKER_MODEL,
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
		const indexValid = idx >= 0 && idx < claims.length;
		const matched = relation === 'expresses' && indexValid;
		const opposed = relation === 'opposes' && indexValid;

		return {
			matchedClusterId: matched ? claims[idx].clusterId : null,
			opposedClusterId: opposed ? claims[idx].clusterId : null,
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

		return { ...NO_MATCH, failedClosed: true };
	}
}

// ---------------------------------------------------------------------------
// Hierarchical classification (hierarchy plan Phase 2): route to topics first,
// classify within them, and ALWAYS fall back to the full flat list when a hop
// answers "none" — routing may save tokens on the common path, it must never
// hide a claim (the recall-gap lesson: a gate that filters can misfile; a
// gate with an ungated second look cannot).
// ---------------------------------------------------------------------------

/** Below this many specific claims a flat read is already cheap — no routing hop. */
export const HIERARCHY_MIN_CLAIMS = 30;
/** Boundary statements straddle themes; routing keeps the top TWO candidates. */
const MAX_ROUTED_TOPICS = 2;

export type RegistryMethod = 'registry' | 'registry-hier' | 'registry-fallback';

export interface HierarchicalClassification extends ClaimClassification {
	/** Which path produced the decision — the fallback-hit rate is a live routing-quality metric. */
	method: RegistryMethod;
	/** Topic claims hop 1 routed to (empty on the flat paths). */
	routedTopicIds: string[];
}

const ROUTE_SYSTEM = `You route a citizen's statement to the topics of a deliberation question. Topics are broad themes that organize specific claims; you are NOT judging agreement, only subject relevance. Statements may be in any language; judge meaning, not wording.

Pick UP TO TWO topics the statement most plausibly belongs under. If no listed topic covers the statement's subject, return an empty list.

Respond with JSON only: {"topicIndices": [<1-based indices, up to 2>], "reason": "<brief>"}`;

/**
 * Hop 1: which topic claims does the statement fall under? Fails open to []
 * (→ flat fallback). Exported: Phase 3 uses the same routing to place newly
 * spawned claims under topics.
 */
export async function routeToTopics(input: {
	statementText: string;
	questionText: string;
	topics: ClusterClaim[];
	model?: string;
}): Promise<ClusterClaim[]> {
	const { statementText, questionText, topics } = input;
	if (topics.length === 0) return [];
	try {
		const list = topics.map((t, i) => renderClaimLine(t, i)).join('\n');
		const text = await callLLM({
			model: input.model ?? WORKER_MODEL,
			system: ROUTE_SYSTEM,
			user: `Question: "${questionText}"\n\nTopics:\n${list}\n\nStatement: "${statementText}"\n\nRespond with the JSON object.`,
			temperature: 0,
			maxTokens: 200,
			jsonMode: true,
		});
		const parsed = JSON.parse(extractJson(text)) as { topicIndices?: unknown };
		if (!Array.isArray(parsed.topicIndices)) return [];

		return parsed.topicIndices
			.filter((i): i is number => typeof i === 'number')
			.map((i) => i - 1)
			.filter((i) => i >= 0 && i < topics.length)
			.slice(0, MAX_ROUTED_TOPICS)
			.map((i) => topics[i]);
	} catch (error) {
		logError(error, {
			operation: 'claimRegistry.routeToTopics',
			metadata: { topicCount: topics.length },
		});

		return [];
	}
}

/**
 * Two-hop classification over a hierarchical codebook, with flat fallback.
 *
 * Flat read when the codebook is small or has no topics (today's behavior).
 * Otherwise: hop 1 routes to ≤2 topics; hop 2 classifies against those topics'
 * children plus root-level specifics; any "none" along the way triggers one
 * flat classification over ALL specific claims before concluding no-match.
 * Topic claims are never attach targets — hop 2 and the fallback see only
 * specific claims.
 */
export async function classifyHierarchical(input: {
	statementText: string;
	questionText: string;
	/** Full codebook including topic claims (loadClaims output). */
	claims: ClusterClaim[];
	cosineByCluster: ReadonlyMap<string, number>;
	model?: string;
}): Promise<HierarchicalClassification> {
	const { statementText, questionText, claims, cosineByCluster, model } = input;
	const specifics = claims.filter(isAttachTarget);
	const topics = claims.filter((c) => c.claimLevel === 'topic');

	const flat = async (method: RegistryMethod): Promise<HierarchicalClassification> => {
		const ordered = orderClaimsForClassification(specifics, cosineByCluster);
		const result = await classifyAgainstClaims({
			statementText,
			questionText,
			claims: ordered,
			model,
		});

		return { ...result, method, routedTopicIds: [] };
	};

	if (topics.length === 0 || specifics.length < HIERARCHY_MIN_CLAIMS) {
		return flat('registry');
	}

	const routed = await routeToTopics({ statementText, questionText, topics, model });
	if (routed.length === 0) return flat('registry-fallback');

	const routedIds = new Set(routed.map((t) => t.clusterId));
	const candidates = specifics.filter(
		(c) => (c.parentClaimId != null && routedIds.has(c.parentClaimId)) || c.parentClaimId == null,
	);
	// Routing that excludes nothing has no fallback to offer — classify flat once.
	if (candidates.length >= specifics.length) {
		const result = await flat('registry-hier');

		return { ...result, routedTopicIds: [...routedIds] };
	}

	const ordered = orderClaimsForClassification(candidates, cosineByCluster);
	const hop2 = await classifyAgainstClaims({ statementText, questionText, claims: ordered, model });
	if (hop2.relation !== 'none' && !hop2.failedClosed) {
		return { ...hop2, method: 'registry-hier', routedTopicIds: [...routedIds] };
	}

	// "None" within the routed scope is not "none" — the right claim may live
	// under an unrouted topic. One full flat read decides.
	const fallback = await flat('registry-fallback');

	return { ...fallback, routedTopicIds: [...routedIds] };
}

// ---------------------------------------------------------------------------
// Claim generation (spawn of singletons, first-run backfill)
// ---------------------------------------------------------------------------

export interface GeneratedClaim {
	canonicalClaim: string;
	publicExplanation: string;
}

const GENERATE_SYSTEM = `You write canonical claims for a public deliberation platform. Given a question and one or more statements proposing the same idea, produce:
- "canonicalClaim": the core proposal in 5-15 words, neutral, present tense, no rhetoric.
- "publicExplanation": 1-2 plain-language sentences explaining the proposal to the general public.

Write BOTH fields in the language of the QUESTION, even when the statements are in a different language — every claim of one question must share the question's language, so the codebook stays uniform regardless of which participant spoke first.

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
//
// Decisions are PERSISTED to Firestore (`_claimRegistry/{questionId}/decisions`),
// not only logged: Cloud Logging retention is short and unqueryable for
// analysis, while calibrating the confidence floor and estimating the
// classifier's error rates both need the accumulated decision set.
// ---------------------------------------------------------------------------

const META_COLLECTION = '_claimRegistry';
const DECISIONS_SUBCOLLECTION = 'decisions';

export interface RegistryDecision {
	questionId: string;
	optionId: string;
	method: RegistryMethod | 'cosine';
	matchedClusterId: string | null;
	opposedClusterId?: string | null;
	cosineAtMatch: number | null;
	relation: ClaimRelation;
	confidence: number;
	claimCount: number;
	model?: string;
	/** The classifier call failed and this decision is a degraded no-match, not a judgment. */
	failedClosed?: boolean;
	/** Topic claims hop 1 routed to (hierarchical path only). */
	routedTopicIds?: string[];
}

/** Fire-and-forget: measurement must never delay or fail the pipeline. */
export function logRegistryDecision(decision: RegistryDecision): void {
	logger.info('claimRegistry.decision', decision);
	db()
		.collection(META_COLLECTION)
		.doc(decision.questionId)
		.collection(DECISIONS_SUBCOLLECTION)
		.add({ ...decision, kind: 'decision', createdAt: Date.now() })
		.catch((error: unknown) => {
			logError(error, {
				operation: 'claimRegistry.logRegistryDecision',
				statementId: decision.questionId,
			});
		});
}

// ---------------------------------------------------------------------------
// Sampled second-model audit. §6 of the mechanism doc concedes that systematic
// biases of a single model family go unmeasured; re-running a small sample of
// classifications on the stronger TAXONOMY_MODEL and persisting agreement is
// the cheapest way to bound them. Runs detached from the pipeline (never on
// the latency path) and only observes — an audit disagreement changes nothing
// about the primary decision, it accumulates evidence for tuning.
// ---------------------------------------------------------------------------

export const AUDIT_SAMPLE_RATE = 0.05;

export async function auditClassification(input: {
	questionId: string;
	optionId: string;
	statementText: string;
	questionText: string;
	claims: ClusterClaim[];
	primary: ClaimClassification;
}): Promise<void> {
	const { questionId, optionId, statementText, questionText, claims, primary } = input;
	try {
		const secondary = await classifyAgainstClaims({
			statementText,
			questionText,
			claims,
			model: TAXONOMY_MODEL,
		});
		// A failed audit call says nothing about (dis)agreement — persisting it
		// would poison the family-bias estimate with rate-limit noise.
		if (secondary.failedClosed) {
			logger.warn('claimRegistry.audit.skippedFailedClosed', { questionId, optionId });

			return;
		}
		const agrees =
			secondary.relation === primary.relation &&
			secondary.matchedClusterId === primary.matchedClusterId;

		logger.info('claimRegistry.audit', {
			questionId,
			optionId,
			agrees,
			primaryRelation: primary.relation,
			secondaryRelation: secondary.relation,
		});
		await db()
			.collection(META_COLLECTION)
			.doc(questionId)
			.collection(DECISIONS_SUBCOLLECTION)
			.add({
				kind: 'audit',
				questionId,
				optionId,
				agrees,
				primary: {
					relation: primary.relation,
					matchedClusterId: primary.matchedClusterId,
					confidence: primary.confidence,
					model: WORKER_MODEL,
				},
				secondary: {
					relation: secondary.relation,
					matchedClusterId: secondary.matchedClusterId,
					confidence: secondary.confidence,
					model: TAXONOMY_MODEL,
				},
				claimCount: claims.length,
				createdAt: Date.now(),
			});
	} catch (error) {
		logError(error, {
			operation: 'claimRegistry.auditClassification',
			statementId: questionId,
			metadata: { optionId },
		});
	}
}
