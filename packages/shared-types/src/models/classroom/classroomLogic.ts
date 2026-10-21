import { CAMP_A_BELOW, CAMP_B_ABOVE, Camp } from './classroomModel';

/** Camp of a slider value: <40 'a', >60 'b', otherwise 'center'. */
export function campOf(side: number): Camp {
	if (side < CAMP_A_BELOW) return 'a';
	if (side > CAMP_B_ABOVE) return 'b';

	return 'center';
}

export interface SupportSubscription {
	camp?: Camp;
	decisionSupport?: number;
}

/** Mean support of one camp. `n` = students who rated, `m` = students in the camp. */
export interface CampSupport {
	mean: number;
	n: number;
	m: number;
}

export type SupportVerdict = 'closer' | 'apart' | 'insufficient';

export interface SupportBySide {
	a: CampSupport;
	center: CampSupport;
	b: CampSupport;
	verdict: SupportVerdict;
}

/**
 * Support for the decision grouped by initial camp.
 *
 * Students without a `camp` are ignored. `m` counts every student of a camp,
 * `n` only those with a `decisionSupport`; `mean` is the plain mean over the n
 * (0 when n = 0).
 *
 * Verdict:
 *  - 'insufficient' when either pole camp (a or b) has n = 0 (nobody rated);
 *  - 'closer' when BOTH a.mean > 0 and b.mean > 0 (both poles lean toward the
 *    decision);
 *  - 'apart' otherwise.
 * `gate` is accepted for the contract (callers pass votingSettings.threshold)
 * but deliberately does not enter the verdict: mapping a consensus gate onto a
 * mean-of-faces scale is not intuitive. The parameter stays so a later rule can
 * use it without changing callers.
 */
export function supportBySide(subs: SupportSubscription[], gate: number): SupportBySide {
	void gate;
	const camps: Camp[] = ['a', 'center', 'b'];
	const sums: Record<Camp, { total: number; n: number; m: number }> = {
		a: { total: 0, n: 0, m: 0 },
		center: { total: 0, n: 0, m: 0 },
		b: { total: 0, n: 0, m: 0 },
	};
	for (const sub of subs) {
		if (!sub.camp) continue;
		const bucket = sums[sub.camp];
		bucket.m += 1;
		if (typeof sub.decisionSupport === 'number') {
			bucket.n += 1;
			bucket.total += sub.decisionSupport;
		}
	}
	const out: Record<Camp, CampSupport> = {
		a: { mean: 0, n: 0, m: 0 },
		center: { mean: 0, n: 0, m: 0 },
		b: { mean: 0, n: 0, m: 0 },
	};
	for (const camp of camps) {
		const { total, n, m } = sums[camp];
		out[camp] = { mean: n > 0 ? total / n : 0, n, m };
	}
	let verdict: SupportVerdict;
	if (out.a.n === 0 || out.b.n === 0) verdict = 'insufficient';
	else if (out.a.mean > 0 && out.b.mean > 0) verdict = 'closer';
	else verdict = 'apart';

	return { a: out.a, center: out.center, b: out.b, verdict };
}

/**
 * The ballot's winner: most votes; tie -> higher consensus (missing = lowest);
 * still tied -> lexicographically lower id. Candidates are the keys of `tally`.
 * Throws on an empty tally.
 */
export function decideBallot(
	tally: Record<string, number>,
	consensus: Record<string, number>,
): string {
	const ids = Object.keys(tally);
	if (ids.length === 0) throw new RangeError('decideBallot: empty tally');
	const consensusOf = (id: string): number => consensus[id] ?? Number.NEGATIVE_INFINITY;

	return ids.reduce((best, id) => {
		if (tally[id] !== tally[best]) return tally[id] > tally[best] ? id : best;
		if (consensusOf(id) !== consensusOf(best)) {
			return consensusOf(id) > consensusOf(best) ? id : best;
		}

		return id < best ? id : best;
	});
}
