import type { Camp } from './classroomModel';
import type { SupportBySide, SupportVerdict } from './classroomLogic';

/**
 * join-class: "support by side" as it leaves the server (Trello btMVQMM5,
 * product decision B). A camp whose mean rests on fewer than
 * CLASS_SIDE_MIN_SHOWN ratings would all but name its raters' support, so its
 * mean is never sent: the camp says `hidden: true` and keeps only its counts.
 *
 * Nothing else that is sent lets the hidden mean be worked out: there is no
 * overall mean in the answer (so no subtraction), and the verdict, which
 * compares both pole means with the gate, is 'insufficient' whenever a pole
 * camp is hidden. The counts n (rated) and m (in the camp) stay: on their own
 * they say nothing about anyone's support.
 */

/** A camp's mean support is shown only when at least this many students of it rated. */
export const CLASS_SIDE_MIN_SHOWN = 3;

export type ShownCampSupport =
	| { hidden: false; mean: number; n: number; m: number }
	| { hidden: true; n: number; m: number };

export interface ShownSupportBySide {
	a: ShownCampSupport;
	center: ShownCampSupport;
	b: ShownCampSupport;
	verdict: SupportVerdict;
}

const CAMPS: readonly Camp[] = ['a', 'center', 'b'];

/** The totals with every too-small camp's mean removed (not zeroed: absent). */
export function shownSupport(full: SupportBySide): ShownSupportBySide {
	const shown = Object.fromEntries(
		CAMPS.map((camp) => {
			const { mean, n, m } = full[camp];
			const value: ShownCampSupport =
				n < CLASS_SIDE_MIN_SHOWN ? { hidden: true, n, m } : { hidden: false, mean, n, m };

			return [camp, value];
		}),
	) as Record<Camp, ShownCampSupport>;
	const poleHidden = shown.a.hidden || shown.b.hidden;

	return {
		a: shown.a,
		center: shown.center,
		b: shown.b,
		verdict: poleHidden ? 'insufficient' : full.verdict,
	};
}
