import {
	EquivalenceVerdict,
	EquivalencePair,
	EquivalenceResult,
	judgeSemanticEquivalence,
} from '../services/semantic-equivalence-service';

/**
 * Complete-linkage post-filter for the bulk idea-synthesis pipeline.
 *
 * Given a connected component produced by union-find on verified-same edges,
 * this stage guarantees the resulting groups are cliques: every internal pair
 * must have verdict "same".
 *
 * Why: union-find on a thresholded graph performs single-linkage clustering,
 * which suffers from chaining (A~B, B~C, but A!~C still merges all three).
 * For synthesis the cost of an incorrect merge is high — it conflates distinct
 * proposals into one. Complete-linkage requires every internal pair to be
 * mutually confirmed, eliminating chaining at the price of additional LLM
 * verification calls on previously-unseen internal pairs.
 *
 * See docs/papers/idea-synthesis-paper.md §2.8.
 */

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
 *    with every existing clique member, then remove and recurse.
 *
 * The greedy strategy is not provably optimal (clique cover is NP-hard) but
 * is sound (every output group is a true clique) and effective for the small
 * group sizes we expect in practice (≤ 10 members in most cases).
 */
export async function refineComponent(
	input: RefineComponentInput,
	judge: (pairs: EquivalencePair[]) => Promise<EquivalenceResult[]> = judgeSemanticEquivalence,
): Promise<RefineComponentResult> {
	const { memberIds, texts, verdicts } = input;

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
		const clique = growClique(seed, remaining, localVerdicts);
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
 * Grow a clique from a seed by adding any candidate that has verdict "same"
 * with every existing clique member.
 *
 * Iterates by descending degree among candidates so densely-connected members
 * join early, which empirically produces larger cliques on the kind of
 * sparse-but-clustered graphs synthesis produces.
 */
function growClique(
	seed: string,
	pool: string[],
	verdicts: Map<string, EquivalenceVerdict>,
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
		const fitsAll = clique.every((member) => verdicts.get(pairKey(candidate, member)) === 'same');
		if (fitsAll) {
			clique.push(candidate);
		}
	}

	return clique;
}
