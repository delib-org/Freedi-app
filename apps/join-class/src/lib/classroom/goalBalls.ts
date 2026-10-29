import type { Statement } from '@freedi/shared-types';
import { enteredGoal } from './voteScope';

/**
 * The projector's Proposals pitch (the Agora goal and balls, ported): every
 * proposal is a ball, and it sits in the goal once its C_p has reached the
 * lesson's gate. Pure: where each ball goes, and which balls just crossed the
 * line (the whistle). Coordinates are in "cqw" - 1 unit = 1% of the pitch width -
 * so the pitch scales to any screen. (Trello syAIyWy3.)
 */

export interface Point {
	x: number;
	y: number;
}

interface Zone {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Pitch height in cqw (its width is 100). */
export const PITCH_HEIGHT = 38;
/** The goal: posts and crossbar around the net, open at the goal line. */
export const GOAL_BOX: Zone = { x: 28, y: 0, width: 44, height: 15 };
const GOAL_INNER: Zone = { x: 30, y: 1.5, width: 40, height: 12.5 };
const FIELD: Zone = { x: 4, y: 19, width: 92, height: 17 };

/** Centre-to-centre distance of the balls, largest first; the first that fits every ball wins. */
const SPACING_TIERS: readonly number[] = [6, 4.8, 3.8, 3, 2.4];
/** A ball is this share of its spacing, so neighbours never touch. */
const BALL_SHARE = 0.82;

export interface GoalBall extends Point {
	id: string;
	inGoal: boolean;
}

export interface GoalLayout {
	balls: GoalBall[];
	/** Ball diameter in cqw. */
	size: number;
}

function capacity(zone: Zone, spacing: number): number {
	return Math.floor(zone.width / spacing) * Math.floor(zone.height / spacing);
}

/** Centres of `count` balls laid out in rows, each row centred in the zone. */
export function slotsIn(zone: Zone, count: number, spacing: number): Point[] {
	const columns = Math.max(1, Math.floor(zone.width / spacing));
	const points: Point[] = [];
	for (let index = 0; index < count; index += 1) {
		const row = Math.floor(index / columns);
		const inRow = Math.min(columns, count - row * columns);
		const column = index % columns;
		const left = zone.x + (zone.width - inRow * spacing) / 2;
		points.push({ x: left + (column + 0.5) * spacing, y: zone.y + (row + 0.5) * spacing });
	}

	return points;
}

/** The proposals worth a ball: visible ones, in a stable (id) order so no ball jumps around. */
function sortedIds(options: readonly Statement[]): Statement[] {
	return options
		.filter((option) => option.hide !== true)
		.sort((a, b) => (a.statementId < b.statementId ? -1 : a.statementId > b.statementId ? 1 : 0));
}

/** Balls in the goal when C_p has reached the gate; unrated proposals sit outside. */
export function goalLayout(options: readonly Statement[], gate: number): GoalLayout {
	const all = sortedIds(options);
	const scored = all.filter((option) => enteredGoal(option, gate));
	const waiting = all.filter((option) => !enteredGoal(option, gate));
	const spacing =
		SPACING_TIERS.find(
			(tier) =>
				scored.length <= capacity(GOAL_INNER, tier) && waiting.length <= capacity(FIELD, tier),
		) ?? SPACING_TIERS[SPACING_TIERS.length - 1];
	const inGoal = slotsIn(GOAL_INNER, scored.length, spacing);
	const outside = slotsIn(FIELD, waiting.length, spacing);

	return {
		size: Math.round(spacing * BALL_SHARE * 100) / 100,
		balls: [
			...scored.map((option, i) => ({ id: option.statementId, inGoal: true, ...inGoal[i] })),
			...waiting.map((option, i) => ({ id: option.statementId, inGoal: false, ...outside[i] })),
		],
	};
}

/**
 * Remembers which proposals were in the goal, so only a real crossing is
 * reported - once per proposal. Proposals already in when the pitch first has
 * data (a page load, a reconnect) are the baseline and never whistle.
 */
export class GoalWatch {
	private lessonKey = '';
	private known: Set<string> | null = null;
	private readonly reported = new Set<string>();

	/** The ids that crossed the gate since the last call. */
	update(lessonKey: string, allIds: readonly string[], inGoalIds: readonly string[]): string[] {
		if (lessonKey !== this.lessonKey) {
			this.lessonKey = lessonKey;
			this.known = null;
			this.reported.clear();
		}
		const now = new Set(inGoalIds);
		if (this.known === null) {
			// wait for the first real data before taking the baseline
			if (allIds.length === 0) return [];
			this.known = now;
			for (const id of now) this.reported.add(id);

			return [];
		}
		const crossed = inGoalIds.filter((id) => !this.known?.has(id) && !this.reported.has(id));
		for (const id of crossed) this.reported.add(id);
		this.known = now;

		return crossed;
	}
}
