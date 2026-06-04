import {
	EquivalenceVerdict,
	EquivalencePair,
	EquivalenceResult,
	judgeSemanticEquivalence,
} from '../services/semantic-equivalence-service';

/**
 * Quorum-tolerant complete-linkage post-filter for the bulk idea-synthesis
 * pipeline.
 *
 * Given a connected component produced by union-find on verified-same edges,
 * this stage refines it into coherent clique-like groups where (almost) every
 * internal pair has verdict "same".
 *
 * Why complete-linkage at all: union-find on a thresholded graph performs
 * single-linkage clustering, which suffers from chaining (A~B, B~C, but A!~C
 * still merges all three). For synthesis the cost of an incorrect merge is high
 * — it conflates distinct proposals into one. Strict complete-linkage requires
 * every internal pair to be mutually confirmed, eliminating chaining at the
 * price of additional LLM verification calls on previously-unseen internal
 * pairs.
 *
 * Why quorum-tolerant: pure unanimity is brittle. A single stray "different"
 * LLM verdict drops a genuine member that is in truth "same" with the rest of
 * its group (observed in negation validation: anti-stance paraphrases worded in
 * a different negation register — "refuse to" / "are against" / "avoid" — were
 * dropped over one noisy pair-verdict even though within-group cosine was
 * 0.91–0.95). We relax the join rule from "same with ALL current members" to
 * "same with a QUORUM of current members". A member survives a small number of
 * noisy "different" verdicts (scaled to clique size), while a genuinely
 * different member — which is "different" against the whole opposing group —
 * still cannot reach quorum and so never joins. This preserves the anti-chaining
 * intent at ZERO added runtime cost: the quorum check reads only the internal
 * pair verdicts that the unanimity rule already required and already fetched.
 *
 * See docs/clusters and synthesis/clustering-and-synthesis-paper.md §5.8.
 */

/**
 * Default quorum fraction for clique membership. A candidate joins a clique if
 * it is "same" with at least this fraction of the current clique members.
 *
 * 0.75 is chosen to preserve the anti-chaining intent while tolerating noise:
 *  - On a clique of 4+ genuine members it permits exactly one stray "different"
 *    verdict (e.g. 3/4 = 0.75 ≥ 0.75 passes; 2/4 = 0.5 fails), rescuing the
 *    single-noisy-verdict case the validation run exposed.
 *  - A genuinely different member is "different" against the whole opposing
 *    group, scoring far below 0.75, so it can never join — chaining stays
 *    impossible.
 * Combined with QUORUM_MAX_DISSENT below, tiny cliques stay effectively
 * unanimous so two-member groups never admit a non-matching member.
 */
export const DEFAULT_QUORUM_FRACTION = 0.75;

/**
 * Absolute cap on tolerated "different" verdicts against an existing clique,
 * regardless of clique size. Guards small cliques: with a cap of 1, a candidate
 * joining a 2- or 3-member clique still needs same with all but at most one,
 * and a 2-member clique stays effectively unanimous (one dissent out of one
 * existing member would be the seed pair itself). Prevents the quorum fraction
 * from silently admitting noise into small groups where one bad pair is a large
 * fraction.
 */
export const QUORUM_MAX_DISSENT = 1;

export interface MemberText {
	id: string;
	text: string;
}

export interface RefineComponentInput {
	/** Member ids forming the component. Must have length ≥ 2 to be meaningful. */
	memberIds: string[];
	/** Lookup from id → display text for any missing pairs that need LLM verdicts. */
	texts: Map<string, string>;
	/** Existing verdicts indexed by canonical pair key. */
	verdicts: Map<string, EquivalenceVerdict>;
	/**
	 * Fraction of existing clique members a candidate must be "same" with to
	 * join (quorum-tolerant linkage). Defaults to {@link DEFAULT_QUORUM_FRACTION}.
	 * Set to 1 for strict unanimity (legacy complete-linkage behaviour).
	 */
	quorumFraction?: number;
}

export interface RefineComponentResult {
	/**
	 * Cliques: every group has length ≥ 2 and every internal pair has verdict
	 * "same". Singletons are dropped (a singleton is not a synthesis candidate).
	 */
	cliques: string[][];
	/** New verdicts the post-filter had to fetch from the LLM. */
	newVerdicts: EquivalenceResult[];
	/** Singleton members that were peeled off the input component. */
	singletons: string[];
}

/**
 * Canonical undirected pair key. Always lexicographic so lookups are
 * order-independent.
 */
export function pairKey(a: string, b: string): string {
	return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Refine one component into clique sub-groups.
 *
 * Internally:
 * 1. Identify any internal pair without a verdict and request one via the
 *    LLM judge (batched).
 * 2. Greedy clique-cover: repeatedly pick the highest-degree remaining member
 *    as a clique seed, grow the clique with members that have verdict "same"
 *    with a quorum of the existing clique members, then remove and recurse.
 *
 * The greedy strategy is not provably optimal (clique cover is NP-hard) but
 * is sound (every output group is a near-clique — same with a quorum of its
 * members) and effective for the small group sizes we expect in practice
 * (≤ 10 members in most cases). All verdicts consulted are internal pairs of
 * the component, all of which are already fetched in step 1, so the quorum
 * relaxation adds no LLM calls.
 */
export async function refineComponent(
	input: RefineComponentInput,
	judge: (pairs: EquivalencePair[]) => Promise<EquivalenceResult[]> = judgeSemanticEquivalence,
): Promise<RefineComponentResult> {
	const { memberIds, texts, verdicts } = input;
	const quorumFraction = input.quorumFraction ?? DEFAULT_QUORUM_FRACTION;

	if (memberIds.length < 2) {
		return { cliques: [], newVerdicts: [], singletons: [...memberIds] };
	}

	const localVerdicts = new Map(verdicts);
	const newVerdicts: EquivalenceResult[] = [];

	const missingPairs: EquivalencePair[] = [];
	for (let i = 0; i < memberIds.length; i++) {
		for (let j = i + 1; j < memberIds.length; j++) {
			const a = memberIds[i];
			const b = memberIds[j];
			const key = pairKey(a, b);
			if (!localVerdicts.has(key)) {
				const textA = texts.get(a);
				const textB = texts.get(b);
				if (textA === undefined || textB === undefined) {
					// Without text we cannot judge — treat as different (conservative).
					localVerdicts.set(key, 'different');
					continue;
				}
				missingPairs.push({ pairId: key, textA, textB });
			}
		}
	}

	if (missingPairs.length > 0) {
		const fetched = await judge(missingPairs);
		for (const result of fetched) {
			localVerdicts.set(result.pairId, result.verdict);
			newVerdicts.push(result);
		}
		// Defensive: any missing pair the judge omitted defaults to different.
		for (const pair of missingPairs) {
			if (!localVerdicts.has(pair.pairId)) {
				localVerdicts.set(pair.pairId, 'different');
			}
		}
	}

	const cliques: string[][] = [];
	const singletons: string[] = [];
	let remaining = [...memberIds];

	while (remaining.length > 0) {
		const seed = pickSeed(remaining, localVerdicts);
		const clique = growClique(seed, remaining, localVerdicts, quorumFraction);
		if (clique.length >= 2) {
			cliques.push(clique);
		} else {
			singletons.push(...clique);
		}
		remaining = remaining.filter((id) => !clique.includes(id));
	}

	return { cliques, newVerdicts, singletons };
}

/**
 * Pick the member with the highest count of "same" verdicts to remaining
 * peers — most likely to form a large clique.
 */
function pickSeed(remaining: string[], verdicts: Map<string, EquivalenceVerdict>): string {
	let bestId = remaining[0];
	let bestDegree = -1;
	for (const id of remaining) {
		let degree = 0;
		for (const other of remaining) {
			if (other === id) continue;
			if (verdicts.get(pairKey(id, other)) === 'same') degree++;
		}
		if (degree > bestDegree) {
			bestDegree = degree;
			bestId = id;
		}
	}

	return bestId;
}

/**
 * Grow a clique from a seed by adding any candidate that is "same" with a
 * quorum of the existing clique members (quorum-tolerant linkage).
 *
 * A candidate joins iff:
 *   sameCount ≥ ceil(quorumFraction * cliqueSize)  AND
 *   (cliqueSize - sameCount) ≤ QUORUM_MAX_DISSENT
 *
 * The first clause rescues a member dropped by one (or, on larger cliques, a
 * few) noisy "different" verdicts. The second clamps the absolute number of
 * tolerated dissents so small cliques stay effectively unanimous and a
 * genuinely different member — "different" against the whole group — can never
 * reach quorum, preserving the anti-chaining guarantee.
 *
 * Iterates by descending degree among candidates so densely-connected members
 * join early, which empirically produces larger cliques on the kind of
 * sparse-but-clustered graphs synthesis produces. All verdicts read here are
 * internal pairs already present in `verdicts` (fetched up front), so this adds
 * no LLM calls.
 */
function growClique(
	seed: string,
	pool: string[],
	verdicts: Map<string, EquivalenceVerdict>,
	quorumFraction: number,
): string[] {
	const clique = [seed];
	const candidates = pool.filter((id) => id !== seed);

	candidates.sort((a, b) => {
		const degA = pool.filter(
			(other) => other !== a && verdicts.get(pairKey(a, other)) === 'same',
		).length;
		const degB = pool.filter(
			(other) => other !== b && verdicts.get(pairKey(b, other)) === 'same',
		).length;

		return degB - degA;
	});

	for (const candidate of candidates) {
		if (meetsQuorum(candidate, clique, verdicts, quorumFraction)) {
			clique.push(candidate);
		}
	}

	return clique;
}

/**
 * Decide whether `candidate` is "same" with enough of the current `clique`
 * members to join under the quorum rule. See {@link growClique}.
 */
function meetsQuorum(
	candidate: string,
	clique: string[],
	verdicts: Map<string, EquivalenceVerdict>,
	quorumFraction: number,
): boolean {
	const sameCount = clique.filter(
		(member) => verdicts.get(pairKey(candidate, member)) === 'same',
	).length;
	const dissentCount = clique.length - sameCount;
	const required = Math.ceil(quorumFraction * clique.length);

	return sameCount >= required && dissentCount <= QUORUM_MAX_DISSENT;
}
