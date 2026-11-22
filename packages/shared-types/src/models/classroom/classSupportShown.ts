import type { Camp } from './classroomModel';
import type { CampSupport, SupportBySide, SupportVerdict } from './classroomLogic';

/**
 * join-class: "support by side" as it leaves the server (Trello btMVQMM5,
 * product decisions B and B2). Small sides are hidden: neither their mean nor
 * their size is ever sent, so nobody can tell which side one student picked.
 *
 * THE RULE (shownSupport):
 *  1. A camp's mean is sent only when the camp has at least CLASS_SIDE_MIN_SHOWN
 *     members (m) AND at least CLASS_SIDE_MIN_SHOWN of them rated (n).
 *     Otherwise the camp is sent as `{ hidden: true }` and nothing else.
 *  2. Counts (n and m) go out only when EVERY camp has at least
 *     CLASS_SIDE_MIN_SHOWN members, and then only for the camps whose mean is
 *     shown. If any camp has 0, 1 or 2 members, no camp carries any count.
 *  3. Unless at least TWO camps pass rule 1, EVERY camp is hidden. One shown
 *     camp has 3+ members, so next to the "X of Y chose a side" count it would
 *     say where most of the named choosers are (with X = 3, all of them).
 *  4. The verdict is 'insufficient' whenever side a or side b is hidden.
 *
 * WHY NO SIZE UNDER 3 CAN BE DERIVED. The teacher knows how many students chose
 * a side ("X of Y chose a side"). If two camps sent their m, the third camp's
 * size would be X minus their sum; even raters (n <= m) would bound it. Rule 2
 * sends counts only when every camp is at least 3 strong, so whatever can be
 * subtracted is a size of 3 or more, which may be shown anyway. When a camp is
 * smaller, no count of any camp is sent, and the shown means carry no size.
 * An empty camp (m = 0) is treated like 1 or 2: hidden, so "nobody chose this"
 * looks the same as "one or two chose this". There is no overall mean or total
 * in the answer, so a hidden mean cannot be recovered by subtraction either.
 *
 * WHAT IS LEFT TO INFER. With two camps shown and one hidden, every chooser may
 * be in either shown camp; nobody is pinned to a side. The weakest remaining
 * inference is about the hidden camp: it may hold no one, so when X is small
 * (X = 6 with two shown camps) it must be empty, i.e. "no student chose the
 * hidden side", without saying which of the two shown sides any student chose.
 */

/** A camp's mean (and the counts) need at least this many members and raters. */
export const CLASS_SIDE_MIN_SHOWN = 3;

/** How many rated (n) out of how many in the camp (m). */
export interface CampCounts {
	n: number;
	m: number;
}

/** A hidden camp carries nothing to read: no mean, no n, no m. */
export type ShownCampSupport =
	| { hidden: false; mean: number; counts: CampCounts | null }
	| { hidden: true };

export interface ShownSupportBySide {
	a: ShownCampSupport;
	center: ShownCampSupport;
	b: ShownCampSupport;
	verdict: SupportVerdict;
}

const CAMPS: readonly Camp[] = ['a', 'center', 'b'];

/** The totals as they may leave the server (see THE RULE above). */
/** Fewer shown camps than this and every camp is hidden (one shown camp would say where most choosers are). */
export const CLASS_SIDE_MIN_SHOWN_CAMPS = 2;

const HIDDEN: ShownCampSupport = { hidden: true };

/** A camp big enough, and rated by enough, to show its mean (rule 1). */
function passes(camp: CampSupport): boolean {
	return camp.m >= CLASS_SIDE_MIN_SHOWN && camp.n >= CLASS_SIDE_MIN_SHOWN;
}

export function shownSupport(full: SupportBySide): ShownSupportBySide {
	if (CAMPS.filter((camp) => passes(full[camp])).length < CLASS_SIDE_MIN_SHOWN_CAMPS) {
		return { a: { ...HIDDEN }, center: { ...HIDDEN }, b: { ...HIDDEN }, verdict: 'insufficient' };
	}
	const countsAllowed = CAMPS.every((camp) => full[camp].m >= CLASS_SIDE_MIN_SHOWN);
	const shownOf = (camp: Camp): ShownCampSupport => {
		const { mean, n, m } = full[camp];
		if (!passes(full[camp])) return { ...HIDDEN };

		return { hidden: false, mean, counts: countsAllowed ? { n, m } : null };
	};
	const a = shownOf('a');
	const center = shownOf('center');
	const b = shownOf('b');

	return { a, center, b, verdict: a.hidden || b.hidden ? 'insufficient' : full.verdict };
}
