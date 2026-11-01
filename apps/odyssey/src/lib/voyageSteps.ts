import type { OdysseyJourney } from '@freedi/shared-types';
import type { GameContent } from './game';
import type { AttitudeMap } from './distance';
import { activeElders } from './elders';
import { crewIsComplete } from './crew';
import { t } from '../i18n/i18n';

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
 * stance on it is marked (which is exactly what "continue the voyage" requires).
 *
 * Labels and details are read through `t()` at call time — the strip renders
 * on every language change, so the legs come back in the new language.
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
	/** what stands accomplished inside the leg — "2/4 winds", "5 islands" */
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

	const crew = activeElders(content.game);
	const chosenCrew = journey.selectedElderIds;

	const islands = content.islands.filter(
		(island) => island.enabled && journey.selectedIslandIds.includes(island.statementId),
	);
	const sailed = islands.filter((island) =>
		island.stances.some((stance) => attitudes[stance.statementId] !== undefined),
	).length;
	const voyageDone = islands.length > 0 && sailed === islands.length;

	const legs: Leg[] = [
		{ path: '/', label: t('step.intro'), done: true },
		{
			path: '/compass',
			label: t('step.compass'),
			done: windsLit === winds,
			detail: t('step.windsDetail', { done: windsLit, total: winds }),
		},
	];

	// A game whose organizer authored no elders never shows the crew screen —
	// it redirects to the map — so a step for it would be one nobody can stand on.
	if (crew.length > 0) {
		legs.push({
			path: '/elders',
			label: t('step.elders'),
			// The crew screen itself will not let the player on until the
			// minimum is aboard, so the strip reports the same gate.
			done: chosenCrew !== undefined && crewIsComplete(chosenCrew.length, crew.length),
			// `undefined` is "not asked yet"; an array is a real answer.
			detail:
				chosenCrew === undefined ? undefined : t('step.crewDetail', { count: chosenCrew.length }),
		});
	}

	legs.push(
		{
			path: '/map',
			label: t('step.map'),
			done: islands.length > 0,
			detail: islands.length > 0 ? t('step.islandsDetail', { count: islands.length }) : undefined,
		},
		{
			path: '/voyage',
			label: t('step.voyage'),
			done: voyageDone,
			detail:
				islands.length > 0
					? t('step.sailedDetail', { done: sailed, total: islands.length })
					: undefined,
		},
		{ path: '/summary', label: t('step.summary'), done: false, isDestination: true },
	);

	// The frontier: everything up to the leg after the furthest one finished.
	// Measuring from the FURTHEST rather than the first unfinished leg is what
	// keeps a skipped screen from walling off the rest of the voyage — a
	// journey begun before the crew screen existed has islands chosen and no
	// crew, and must still be free to sail.
	const furthestDone = legs.reduce((furthest, leg, index) => (leg.done ? index : furthest), -1);

	return legs.map((leg, index) => {
		const unlocked = leg.done || index <= furthestDone + 1;

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
