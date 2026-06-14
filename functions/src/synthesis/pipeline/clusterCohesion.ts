/**
 * Cluster cohesion gate — the snowball brake for synth attaches.
 *
 * The attach passes in `runSinglePipeline` use a cluster's `bestSimilarity`
 * (the MAX over its title cosine and its best single member cosine) as the
 * candidacy signal. That max is deliberately permissive — it prevents
 * duplicate-synth fragmentation when an abstracted synth title drifts away
 * from its long-form members.
 *
 * But "≥ threshold to ANY one member" is exactly what lets a synth SNOWBALL:
 * a newcomer that paraphrases just one member joins, then the next newcomer
 * paraphrases a different member and joins too, until the cluster spans
 * several distinct ideas held together only by a chain of pairwise links.
 * (Observed in production: a "safe settlement" synth that absorbed belonging,
 * beauty, growth, and community options — one member at cosine 0.43 to the
 * rest still rode in.)
 *
 * The fix keeps `bestSimilarity` as the candidacy signal but adds a COHESION
 * gate before a synth attach actually fires. Instead of "close to one member",
 * the newcomer must be close to the cluster as a whole, measured two ways:
 *
 *   1. CENTROID — cosine to the mean of the member embeddings. The centroid
 *      is the cluster's true center (unlike the title, which abstracts and
 *      drifts; unlike a single member, which is arbitrary). As a cluster's
 *      spread grows, the centroid sits in the middle and genuine outliers
 *      fall below the floor naturally.
 *
 *   2. QUORUM — the fraction of members the newcomer is "broadly related" to
 *      (cosine ≥ a per-member floor). A softened complete-linkage: it tolerates
 *      one or two noisy member cosines but rejects an outlier that only matches
 *      a single member.
 *
 * The gate passes on EITHER signal (OR), so it does not re-introduce
 * fragmentation — a genuine paraphrase of a tight cluster clears both easily,
 * while a single-member outlier fails both and is kept out.
 *
 * Fail-open: with no usable member embeddings, the gate passes (the attach
 * falls back to the legacy `bestSimilarity`-only behavior).
 */

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

/** Element-wise mean of equal-length vectors. Empty input → empty vector. */
export function centroidOf(vectors: number[][]): number[] {
	const usable = vectors.filter((v) => v.length > 0);
	if (usable.length === 0) return [];
	const dim = usable[0].length;
	const sum = new Array<number>(dim).fill(0);
	let counted = 0;
	for (const v of usable) {
		if (v.length !== dim) continue;
		for (let i = 0; i < dim; i++) sum[i] += v[i];
		counted++;
	}
	if (counted === 0) return [];

	return sum.map((x) => x / counted);
}

export interface CohesionAssessment {
	/** Number of members with a usable stored embedding. */
	memberCount: number;
	/** Cosine of the new option to the member centroid (0 if no members). */
	centroidCosine: number;
	/** Fraction of members the new option is ≥ `memberFloor` to (0 if no members). */
	fractionAboveFloor: number;
}

/**
 * Measure how well a new option fits an existing cluster, given the cluster's
 * member embeddings and the option's embedding.
 */
export function assessCohesion(
	memberEmbeddings: number[][],
	optionEmbedding: number[],
	memberFloor: number,
): CohesionAssessment {
	const usable = memberEmbeddings.filter(
		(v) => v.length === optionEmbedding.length && v.length > 0,
	);
	if (usable.length === 0) {
		return { memberCount: 0, centroidCosine: 0, fractionAboveFloor: 0 };
	}
	const centroid = centroidOf(usable);
	const centroidCosine = centroid.length > 0 ? cosine(centroid, optionEmbedding) : 0;
	const aboveFloor = usable.filter((v) => cosine(v, optionEmbedding) >= memberFloor).length;

	return {
		memberCount: usable.length,
		centroidCosine,
		fractionAboveFloor: aboveFloor / usable.length,
	};
}

export interface CohesionGate {
	/** Cosine-to-centroid floor; clearing it alone passes the gate. */
	centroidFloor: number;
	/** Per-member "broadly related" floor used to compute the quorum. */
	memberFloor: number;
	/** Fraction of members above `memberFloor` that alone passes the gate. */
	quorumFraction: number;
}

/**
 * Whether a new option is cohesive enough with the cluster to attach. Passes on
 * EITHER the centroid signal OR the quorum signal. Fail-open when no member
 * embeddings are available (memberCount 0).
 */
export function passesCohesionGate(assessment: CohesionAssessment, gate: CohesionGate): boolean {
	if (assessment.memberCount === 0) return true;

	return (
		assessment.centroidCosine >= gate.centroidFloor ||
		assessment.fractionAboveFloor >= gate.quorumFraction
	);
}
