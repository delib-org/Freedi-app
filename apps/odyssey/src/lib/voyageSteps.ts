import type { OdysseyJourney } from '@freedi/shared-types';
import type { GameContent } from './game';
import type { AttitudeMap } from './distance';
import { sailedCount, voyageIslands } from './voyageRoute';

/**
 * The voyage, as a list of legs.
 *
 * The player used to see one stage name in the top bar and nothing else: no
 * way to tell how much of the journey was behind them, how much was ahead, or
 * that the compass they abandoned half-answered was still waiting. This is the
 * single place that answers both questions — where am I, and what have I
 * finished — so the strip in the header and anything else that asks are
 * reading the same truth.
 *
 * Every rule here mirrors the gate the screen itself enforces: the compass is
 * done when all its winds are lit, an island counts as sailed the moment one
 * stance on it is marked (which is exactly what "להמשך המסע" requires).
 */

/** How many values the fourth wind ranks. Mirrors the compass screen's cap. */
export const TOP_VALUES = 3;

export type VoyageStepStatus =
	/** finished */
	| 'done'
	/** the screen the player is standing on */
	| 'current'
	/** reachable, not finished */
	| 'open'
	/** everything before it is still unfinished */
	| 'locked';

export interface VoyageStep {
	path: string;
	label: string;
	status: VoyageStepStatus;
	/** what stands accomplished inside the leg — "2/4 רוחות", "5 איים" */
	detail?: string;
	/** the homecoming: an arrival rather than a task, so it earns no ✓ */
	isDestination: boolean;
}

interface Leg {
	path: string;
	label: string;
	done: boolean;
	detail?: string;
	isDestination?: boolean;
	/** open regardless of the legs before it — the player has already been there */
	reached?: boolean;
}

export interface VoyageStepsInput {
	content: GameContent | null;
	journey: OdysseyJourney | null;
	attitudes: AttitudeMap;
	pathname: string;
}

export function voyageSteps({
	content,
	journey,
	attitudes,
	pathname,
}: VoyageStepsInput): VoyageStep[] {
	// No game or no journey — nothing has been accomplished yet, and a strip of
	// empty steps above the sign-in screen would be a promise, not a map.
	if (!content || !journey) return [];

	const questions = (content.game.compassQuestions ?? []).filter((question) => question.enabled);
	const answered = questions.filter((question) => {
		const entry = journey.compassAnswers?.[question.questionId];

		return Boolean(entry && (entry.answer.trim() !== '' || entry.chips.length > 0));
	}).length;
	// Ranking the values is the fourth wind, and counts as one.
	const winds = questions.length + 1;
	const ranked = Object.keys(journey.valueRankings ?? {}).length;
	const windsLit = answered + (ranked >= TOP_VALUES ? 1 : 0);

	// No island is chosen up front any more: the route is every enabled island,
	// and the crew forms on its own after the first one — so neither the map
	// nor the crew is a leg the player has to finish. The voyage earns its ✓
	// only when every island is sailed, but the player may stop whenever they
	// like — so the summary opens as soon as one island is.
	const islands = voyageIslands(content);
	const sailed = sailedCount(islands, attitudes);

	const legs: Leg[] = [
		{ path: '/', label: 'הקדמה', done: true },
		{
			path: '/compass',
			label: 'המצפן',
			done: windsLit === winds,
			detail: `${windsLit}/${winds} רוחות`,
		},
		{
			path: '/voyage',
			label: 'ההפלגה',
			done: islands.length > 0 && sailed === islands.length,
			reached: sailed > 0,
			detail: islands.length > 0 ? `${sailed}/${islands.length} איים` : undefined,
		},
		{ path: '/summary', label: 'הסיכום', done: false, isDestination: true, reached: sailed > 0 },
	];

	// The frontier: everything up to the leg after the furthest one finished.
	// Measuring from the FURTHEST rather than the first unfinished leg is what
	// keeps a half-answered compass from walling off islands already sailed.
	const furthestDone = legs.reduce((furthest, leg, index) => (leg.done ? index : furthest), -1);

	return legs.map((leg, index) => {
		const unlocked = leg.done || leg.reached === true || index <= furthestDone + 1;

		const status: VoyageStepStatus =
			pathname === leg.path ? 'current' : leg.done ? 'done' : unlocked ? 'open' : 'locked';

		return {
			path: leg.path,
			label: leg.label,
			status,
			detail: leg.detail,
			isDestination: leg.isDestination === true,
		};
	});
}
