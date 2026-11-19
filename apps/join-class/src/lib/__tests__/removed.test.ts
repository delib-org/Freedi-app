import { describe, expect, it } from 'vitest';
import type { ClassGame, ClassPlan } from '@freedi/shared-types';
import type { ClassLessonEntry } from '../joinSubscriptions';
import {
	buildAllPlanRows,
	buildPlanRows,
	copySources,
	gameSections,
	openNow,
	visibleLessons,
} from '../planTree';
import { buildRemoved, removedCount } from '../removedItems';
import { lessonRemovable, removalKey } from '../removalTargets';

const NOW = 10 * 24 * 60 * 60 * 1000;

function lesson(id: string, over: Partial<ClassLessonEntry> = {}, planId = 'p1', gameId = 'g1') {
	return {
		id,
		title: `lesson ${id}`,
		openedInClass: NOW - 1000,
		status: 'live',
		stepIndex: 0,
		stepCount: 9,
		createdAt: 1000,
		link: { planId, gameId, classId: 'c1', className: 'A', lessonName: '', legacy: false },
		...over,
	} as ClassLessonEntry;
}

const plan = (planId: string, removedAt?: number): ClassPlan => ({
	planId,
	title: `plan ${planId}`,
	ownerUid: 'u',
	createdAt: 1,
	lastUpdate: 1,
	...(removedAt === undefined ? {} : { removedAt }),
});

const game = (gameId: string, planId: string, removedAt?: number): ClassGame => ({
	gameId,
	planId,
	ownerUid: 'u',
	title: `game ${gameId}`,
	order: 0,
	snapshot: { questions: [], paragraphs: [], introVideos: [], settings: {} },
	createdAt: 1,
	lastUpdate: 1,
	...(removedAt === undefined ? {} : { removedAt }),
});

describe('buildPlanRows with removed items', () => {
	it('leaves out a removed plan and does not rebuild it from its lessons', () => {
		const rows = buildPlanRows([lesson('a'), lesson('b', {}, 'p2')], [plan('p1', 5), plan('p2')]);
		expect(rows.map((r) => r.planId)).toEqual(['p2']);
	});

	it('leaves out a removed lesson but keeps the plan', () => {
		const rows = buildPlanRows([lesson('a', { removedAt: 5 }), lesson('b')], [plan('p1')]);
		expect(rows).toHaveLength(1);
		expect(rows[0].lessons.map((l) => l.id)).toEqual(['b']);
	});

	it('leaves out a removed old lesson, which would otherwise be a plan of its own', () => {
		const old = lesson('old', { removedAt: 5 }, 'old', 'old');
		old.link.legacy = true;
		expect(buildPlanRows([old], [])).toEqual([]);
	});

	it('the full rows keep a removed plan and its removed lessons for the plan screen', () => {
		const rows = buildAllPlanRows([lesson('a', { removedAt: 5 })], [plan('p1', 5)]);
		expect(rows).toHaveLength(1);
		expect(rows[0].doc?.removedAt).toBe(5);
		expect(rows[0].lessons.map((l) => l.id)).toEqual(['a']);
	});
});

describe('visibleLessons, openNow, gameSections, copySources', () => {
	it('visibleLessons drops removed lessons except the ones kept on screen', () => {
		const list = [lesson('a', { removedAt: 5 }), lesson('b', { removedAt: 6 }), lesson('c')];
		expect(visibleLessons(list).map((l) => l.id)).toEqual(['c']);
		expect(visibleLessons(list, new Set(['b'])).map((l) => l.id)).toEqual(['b', 'c']);
	});

	it('openNow leaves out a removed lesson', () => {
		const list = [lesson('a', { removedAt: 5 }), lesson('b')];
		expect(openNow(list, NOW).map((l) => l.id)).toEqual(['b']);
	});

	it('a removed game is left out; the lessons the class ran stay in an action-less section', () => {
		const ran = lesson('ran', { status: 'ended' });
		const sections = gameSections([game('g1', 'p1', 5), game('g2', 'p1')], [ran]);
		expect(sections.map((s) => s.gameId)).toEqual(['g2', 'g1']);
		const orphan = sections[1];
		expect(orphan.game).toBeNull();
		expect(orphan.lessons.map((l) => l.id)).toEqual(['ran']);
	});

	it('copySources leaves out removed games and removed old lessons', () => {
		const rows = buildAllPlanRows([], [plan('p1')]);
		const sources = copySources(rows, new Map([['p1', [game('g1', 'p1', 5), game('g2', 'p1')]]]));
		expect(sources.map((s) => s.id)).toEqual(['g2']);
	});
});

describe('buildRemoved', () => {
	const entries = [
		lesson('l-old', { removedAt: 10 }),
		lesson('l-new', { removedAt: 30 }),
		lesson('l-in-removed-plan', { removedAt: 20 }, 'p2', 'g9'),
	];
	const plans = [plan('p1'), plan('p2', 40), plan('p3', 50)];
	const games = new Map<string, readonly ClassGame[]>([
		['p1', [game('g1', 'p1', 15), game('g2', 'p1')]],
		['p2', [game('g9', 'p2', 25)]],
	]);

	it('groups removed plans, games and lessons, newest first', () => {
		const out = buildRemoved(entries, plans, games);
		expect(out.plans.map((p) => p.planId)).toEqual(['p3', 'p2']);
		expect(out.games.map((g) => g.gameId)).toEqual(['g1']);
		expect(out.lessons.map((l) => l.entry.id)).toEqual(['l-new', 'l-old']);
		expect(removedCount(out)).toBe(5);
	});

	it('names the plan and game a removed lesson belongs to', () => {
		const out = buildRemoved(entries, plans, games);
		expect(out.lessons[0]).toMatchObject({ planTitle: 'plan p1', gameTitle: 'game g1' });
	});

	it('is empty when nothing is removed', () => {
		expect(removedCount(buildRemoved([lesson('a')], [plan('p1')], new Map()))).toBe(0);
	});
});

describe('lessonRemovable', () => {
	it('allows ended and not-started lessons', () => {
		expect(lessonRemovable({ status: 'ended', stepIndex: 6 })).toBe(true);
		expect(lessonRemovable({ status: 'live', stepIndex: 0 })).toBe(true);
	});

	it('refuses live past step one, paused and open lessons', () => {
		expect(lessonRemovable({ status: 'live', stepIndex: 1 })).toBe(false);
		expect(lessonRemovable({ status: 'paused', stepIndex: 0 })).toBe(false);
		expect(lessonRemovable({ status: 'open', stepIndex: 0 })).toBe(false);
	});

	it('keys one item once per kind', () => {
		expect(removalKey({ kind: 'plan', planId: 'a' })).not.toBe(
			removalKey({ kind: 'lesson', mainId: 'a' }),
		);
	});
});
