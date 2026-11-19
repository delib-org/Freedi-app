import type { ClassGame, ClassPlan } from '@freedi/shared-types';
import type { ClassLessonEntry } from './joinSubscriptions';
import { isRemoved } from './planTree';

/**
 * What "הוסרו" lists (docs/ia/join-class-remove-lessons.md 4, 8): removed plans, removed games
 * of plans still on the lists, and removed lessons of plans still on the lists. A removed
 * plan hides its games and lessons (they are reached through the plan). Most recently
 * removed first inside each group.
 */

export interface RemovedPlan {
	planId: string;
	title: string;
	removedAt: number;
}

export interface RemovedGame {
	planId: string;
	gameId: string;
	title: string;
	planTitle: string;
	removedAt: number;
}

export interface RemovedLesson {
	entry: ClassLessonEntry;
	planTitle: string;
	gameTitle: string;
	removedAt: number;
}

export interface RemovedItems {
	plans: RemovedPlan[];
	games: RemovedGame[];
	lessons: RemovedLesson[];
}

const newestRemovedFirst = (a: { removedAt: number }, b: { removedAt: number }): number =>
	b.removedAt - a.removedAt;

export function buildRemoved(
	entries: readonly ClassLessonEntry[],
	planDocs: readonly ClassPlan[],
	gamesByPlan: ReadonlyMap<string, readonly ClassGame[]>,
): RemovedItems {
	const removedPlanIds = new Set(planDocs.filter(isRemoved).map((p) => p.planId));
	const planTitles = new Map(planDocs.map((p) => [p.planId, p.title]));
	const gameTitles = new Map<string, string>();
	for (const games of gamesByPlan.values())
		for (const g of games) gameTitles.set(g.gameId, g.title);

	const plans = planDocs
		.filter(isRemoved)
		.map((p) => ({ planId: p.planId, title: p.title, removedAt: p.removedAt ?? 0 }));

	const games: RemovedGame[] = [];
	for (const [planId, list] of gamesByPlan) {
		if (removedPlanIds.has(planId)) continue;
		for (const g of list.filter(isRemoved)) {
			games.push({
				planId,
				gameId: g.gameId,
				title: g.title,
				planTitle: planTitles.get(planId) ?? '',
				removedAt: g.removedAt ?? 0,
			});
		}
	}

	const lessons = entries
		.filter((e) => isRemoved(e) && !removedPlanIds.has(e.link.planId))
		.map((entry) => ({
			entry,
			planTitle: planTitles.get(entry.link.planId) ?? entry.title,
			gameTitle: gameTitles.get(entry.link.gameId) ?? entry.title,
			removedAt: entry.removedAt ?? 0,
		}));

	return {
		plans: plans.sort(newestRemovedFirst),
		games: games.sort(newestRemovedFirst),
		lessons: lessons.sort(newestRemovedFirst),
	};
}

/** How many items "הוסרו" holds (its count, and whether it shows at all). */
export function removedCount(items: RemovedItems): number {
	return items.plans.length + items.games.length + items.lessons.length;
}
