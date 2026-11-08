import type { ClassGame, ClassPlan } from '@freedi/shared-types';
import type { ClassLessonEntry } from './joinSubscriptions';

/**
 * Plan > game > lesson, grouped on the client (docs/ia/join-class-lesson-plan.md
 * 5 and 8). Pure: a teacher has well under a hundred lessons, so the home reads
 * the plan docs and the lesson list and joins them here.
 *
 * An old lesson (no `classLesson`) is its own plan: `planId = gameId = its id`
 * (v1 rule, decision 11). It has no plan doc until the migration or a rename
 * makes one, and no game doc either.
 */

/** "Open now" shows lessons opened within this many days. */
export const OPEN_NOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The class filter value for lessons held with no class. */
export const FILTER_NO_CLASS = '__none';
/** The class filter value for every class. */
export const FILTER_ALL = '';

export interface PlanRow {
	planId: string;
	title: string;
	/** The plan doc, or null for a plan that is only an old lesson. */
	doc: ClassPlan | null;
	lessons: ClassLessonEntry[];
	/** The newest change among the plan doc and its lessons (ms). */
	lastActivity: number;
}

function newestFirst(a: ClassLessonEntry, b: ClassLessonEntry): number {
	return b.createdAt - a.createdAt;
}

function titleOf(
	planId: string,
	doc: ClassPlan | null,
	lessons: readonly ClassLessonEntry[],
): string {
	if (doc) return doc.title;

	return (lessons.find((l) => l.id === planId) ?? lessons[0])?.title ?? '';
}

/** Every plan the teacher has: plan docs, and the plans old lessons stand for. Newest activity first. */
export function buildPlanRows(
	entries: readonly ClassLessonEntry[],
	planDocs: readonly ClassPlan[],
): PlanRow[] {
	const docs = new Map(planDocs.map((p) => [p.planId, p]));
	const groups = new Map<string, ClassLessonEntry[]>();
	for (const plan of planDocs) groups.set(plan.planId, []);
	for (const entry of entries) {
		groups.set(entry.link.planId, [...(groups.get(entry.link.planId) ?? []), entry]);
	}

	return [...groups]
		.map(([planId, lessons]): PlanRow => {
			const doc = docs.get(planId) ?? null;
			const sorted = [...lessons].sort(newestFirst);

			return {
				planId,
				title: titleOf(planId, doc, sorted),
				doc,
				lessons: sorted,
				lastActivity: Math.max(doc?.lastUpdate ?? 0, ...sorted.map((l) => l.openedInClass)),
			};
		})
		.sort((a, b) => b.lastActivity - a.lastActivity);
}

/** Finds a plan by id. */
export function planRowById(rows: readonly PlanRow[], planId: string): PlanRow | undefined {
	return rows.find((r) => r.planId === planId);
}

/** Lessons running or waiting (live, paused, open) that were opened in the last OPEN_NOW_DAYS days. */
export function openNow(entries: readonly ClassLessonEntry[], now: number): ClassLessonEntry[] {
	return entries
		.filter((e) => e.status !== 'ended' && now - e.openedInClass <= OPEN_NOW_DAYS * DAY_MS)
		.sort((a, b) => b.openedInClass - a.openedInClass);
}

/** One game of a plan with the lessons played from it, newest first. */
export interface GameSection {
	gameId: string;
	title: string;
	/** The game doc, or null for the section an old lesson stands for. */
	game: ClassGame | null;
	lessons: ClassLessonEntry[];
}

/** The plan's games in order, then one section per old lesson whose game has no doc. */
export function gameSections(
	games: readonly ClassGame[],
	lessons: readonly ClassLessonEntry[],
): GameSection[] {
	const known = new Set(games.map((g) => g.gameId));
	const sections: GameSection[] = games.map((game) => ({
		gameId: game.gameId,
		title: game.title,
		game,
		lessons: lessons.filter((l) => l.link.gameId === game.gameId).sort(newestFirst),
	}));
	const orphanIds = new Set(
		lessons.filter((l) => !known.has(l.link.gameId)).map((l) => l.link.gameId),
	);
	for (const gameId of orphanIds) {
		const own = lessons.filter((l) => l.link.gameId === gameId).sort(newestFirst);
		sections.push({ gameId, title: own[0]?.title ?? '', game: null, lessons: own });
	}

	return sections;
}

/** A class a plan's lessons were held with (`id` is FILTER_NO_CLASS for "no class"). */
export interface PlanClass {
	id: string;
	name: string;
}

/** The distinct classes of some lessons, most recent first. Old lessons and "no class" lessons count as one "no class". */
export function classesOf(lessons: readonly ClassLessonEntry[]): PlanClass[] {
	const seen = new Map<string, PlanClass>();
	for (const lesson of [...lessons].sort(newestFirst)) {
		const id = lesson.link.classId ?? FILTER_NO_CLASS;
		if (!seen.has(id)) seen.set(id, { id, name: lesson.link.className });
	}

	return [...seen.values()];
}

/** A class filter appears at two or more distinct classes in the plan. */
export function showsClassFilter(lessons: readonly ClassLessonEntry[]): boolean {
	return classesOf(lessons).length >= 2;
}

/** Narrows lessons to one class (FILTER_ALL keeps all). */
export function lessonsOfClass(
	lessons: readonly ClassLessonEntry[],
	filter: string,
): ClassLessonEntry[] {
	if (filter === FILTER_ALL) return [...lessons];

	return lessons.filter((l) => (l.link.classId ?? FILTER_NO_CLASS) === filter);
}

/** A source for "questions from another game": a game, or an old lesson that is still only a lesson. */
export interface CopySource {
	kind: 'game' | 'lesson';
	id: string;
	planId: string;
	planTitle: string;
	title: string;
	game: ClassGame | null;
}

/** Games of every plan (as loaded) plus old lessons, grouped by plan in `rows` order. */
export function copySources(
	rows: readonly PlanRow[],
	gamesByPlan: ReadonlyMap<string, readonly ClassGame[]>,
): CopySource[] {
	const sources: CopySource[] = [];
	for (const row of rows) {
		const games = gamesByPlan.get(row.planId) ?? [];
		for (const game of games) {
			sources.push({
				kind: 'game',
				id: game.gameId,
				planId: row.planId,
				planTitle: row.title,
				title: game.title,
				game,
			});
		}
		const known = new Set(games.map((g) => g.gameId));
		for (const lesson of row.lessons) {
			if (!lesson.link.legacy || known.has(lesson.id)) continue;
			sources.push({
				kind: 'lesson',
				id: lesson.id,
				planId: row.planId,
				planTitle: row.title,
				title: lesson.title,
				game: null,
			});
		}
	}

	return sources;
}
