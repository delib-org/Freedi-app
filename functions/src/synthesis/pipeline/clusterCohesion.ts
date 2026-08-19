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
		assessment.centroidCosine >= gate.centroidFloor &&
		assessment.fractionAboveFloor >= gate.quorumFraction
	);
}

/**
 * Where the synth-attach centroid floor belongs: halfway up the synth band.
 *
 * The gate above was originally an OR with `memberFloor = clusterThreshold`, and
 * on a single-question corpus that made it inert — 80% of cross-topic pairs clear
 * a 0.60 per-member floor, so the quorum arm passed unconditionally and the whole
 * gate with it. Measured directly: zero cohesion rejections in a 100-statement
 * run, while a 4-member synth quietly merged compost collection with recycling
 * pickup (P=0.846 for that run).
 *
 * Measured separation on the accuracy corpus. GENUINE is a paraphrase joining its
 * partner (within-pair cosine); FALSE is every non-member's cosine to a synth's
 * member centroid, 4900 candidates:
 *
 *   GENUINE            min 0.824   p10 0.862   median 0.898
 *   FALSE same-topic   median 0.723   p99 0.831   max 0.845
 *   FALSE cross-topic  median 0.652   p99 0.760   max 0.801
 *
 *   floor 0.78 → 50/50 genuine kept, 63 false admitted
 *   floor 0.82 → 50/50 genuine kept,  9 false admitted
 *   floor 0.85 → 45/50 genuine kept,  0 false admitted
 *
 * Expressed as a fraction of the synth band rather than a constant so it tracks
 * an admin who retunes the bands: at shipped defaults it lands on 0.815, in the
 * flat part of the curve where nothing genuine is lost yet.
 *
 * A rejected newcomer is not lost — it spawns its own synth, and the scheduled
 * re-judge sweep merges near-identical synths under LLM judgement, which is a
 * better-informed decision than a blind cosine attach.
 */
export function synthCentroidFloor(synthLowerBound: number, attachThreshold: number): number {
	return synthLowerBound + (attachThreshold - synthLowerBound) * 0.5;
}

/**
 * Topic-cluster attach gate — the same two signals, combined with AND instead
 * of OR, and anchored on the CENTROID rather than on the best single member.
 *
 * Why topic attach needs its own, stricter rule. Measured on the 100-statement
 * accuracy corpus (`scripts/preflightCorpusCosines.ts`, text-embedding-3-small
 * with the production question prefix):
 *
 *   within-pair (same idea)      0.824 … 0.938   median 0.898
 *   cross-idea, same topic       0.600 … 0.836   median 0.705
 *   cross-topic                  0.505 … 0.786   median 0.634
 *
 * The last two bands overlap almost completely, so the MAX-over-members
 * evidence score that drives attach candidacy cannot separate them at all:
 * 80% of cross-topic pairs clear a 0.60 gate, and one member matching at 0.60
 * is enough to pull an unrelated statement into the theme. That is exactly the
 * black hole the benchmark measured — one topic cluster holding all 100
 * statements and zero syntheses.
 *
 * The centroid does separate them, because averaging a theme's members cancels
 * the per-pair noise that the max deliberately amplifies. Same corpus,
 * hold-one-out over each theme, on-theme vs off-theme centroid cosine:
 *
 *   3 members   best cut 0.773 → F1 0.751
 *   5 members   best cut 0.802 → F1 0.749
 *   10 members  best cut 0.816 → F1 0.877  (P 0.943, R 0.820)
 *
 * The cut lands on `synthLowerBound` (0.78) across cluster sizes, which is why
 * the caller passes that as `centroidFloor` rather than `clusterThreshold`.
 *
 * The AND is deliberate: with OR, the quorum term alone re-opens the hole
 * (an off-theme newcomer clears a 0.60 per-member floor against ~80% of
 * members). Fail-open on no member embeddings, as with the synth gate.
 *
 * Note this is a per-language *configuration* result, not a universal constant.
 * The same measurement on the Hebrew corpus separates at only F1 0.31–0.41
 * under text-embedding-3-small — no gate rescues that; it needs a better
 * embedding model (see the study's D3).
 */
export function passesTopicCohesionGate(
	assessment: CohesionAssessment,
	gate: CohesionGate,
): boolean {
	if (assessment.memberCount === 0) return true;

	return (
		assessment.centroidCosine >= gate.centroidFloor &&
		assessment.fractionAboveFloor >= gate.quorumFraction
	);
}
