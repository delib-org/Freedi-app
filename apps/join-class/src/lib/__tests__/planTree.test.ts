import { describe, expect, it } from 'vitest';
import type { ClassGame, ClassPlan } from '@freedi/shared-types';
import type { ClassLessonEntry } from '../joinSubscriptions';
import {
	FILTER_ALL,
	FILTER_NO_CLASS,
	buildPlanRows,
	classesOf,
	copySources,
	gameSections,
	lessonsOfClass,
	openNow,
	showsClassFilter,
} from '../planTree';
import { linkOf } from '../lessonLinks';

const DAY = 24 * 60 * 60 * 1000;

function lesson(
	id: string,
	over: Omit<Partial<ClassLessonEntry>, 'link'> & { link?: Partial<ClassLessonEntry['link']> },
): ClassLessonEntry {
	const { link, ...rest } = over;

	return {
		id,
		title: `lesson ${id}`,
		openedInClass: 1000,
		status: 'live',
		stepIndex: 0,
		stepCount: 9,
		createdAt: 1000,
		link: {
			planId: 'p1',
			gameId: 'g1',
			classId: 'c1',
			className: 'ט׳2',
			lessonName: '',
			legacy: false,
			...link,
		},
		...rest,
	};
}

const plan = (planId: string, title: string, lastUpdate = 1): ClassPlan => ({
	planId,
	title,
	ownerUid: 'u',
	createdAt: 1,
	lastUpdate,
});

const game = (gameId: string, planId: string, title: string, order = 0): ClassGame => ({
	gameId,
	planId,
	ownerUid: 'u',
	title,
	order,
	snapshot: { questions: [], paragraphs: [], introVideos: [], settings: {} },
	createdAt: 1,
	lastUpdate: 1,
});

describe('linkOf', () => {
	it('reads classLesson', () => {
		expect(
			linkOf({
				statementId: 'L',
				statementSettings: {
					classLesson: { planId: 'p', gameId: 'g', classId: 'c', className: 'A' },
				},
			}),
		).toEqual({
			planId: 'p',
			gameId: 'g',
			classId: 'c',
			className: 'A',
			lessonName: '',
			legacy: false,
		});
	});

	it('an old lesson is its own plan and game, with no class', () => {
		expect(linkOf({ statementId: 'L' })).toEqual({
			planId: 'L',
			gameId: 'L',
			classId: null,
			className: '',
			lessonName: '',
			legacy: true,
		});
	});
});

describe('buildPlanRows', () => {
	it('lists plan docs, the plans old lessons stand for, newest activity first', () => {
		const old = lesson('L', {
			openedInClass: 5000,
			link: { planId: 'L', gameId: 'L', classId: null, className: '', legacy: true },
		});
		const rows = buildPlanRows(
			[old, lesson('a', { openedInClass: 2000 })],
			[plan('p1', 'Bullying', 10), plan('p2', 'Empty', 3)],
		);
		expect(rows.map((r) => r.planId)).toEqual(['L', 'p1', 'p2']);
		expect(rows[0].title).toBe('lesson L');
		expect(rows[0].doc).toBeNull();
		expect(rows[1].lessons).toHaveLength(1);
		expect(rows[2].lessons).toHaveLength(0);
	});
});

describe('openNow', () => {
	it('keeps live/paused/open lessons of the last 7 days, newest first', () => {
		const now = 10 * DAY;
		const list = [
			lesson('old', { openedInClass: now - 8 * DAY }),
			lesson('ended', { status: 'ended', openedInClass: now - DAY }),
			lesson('a', { openedInClass: now - 2 * DAY }),
			lesson('b', { status: 'paused', openedInClass: now - DAY }),
		];
		expect(openNow(list, now).map((l) => l.id)).toEqual(['b', 'a']);
	});
});

describe('gameSections', () => {
	it('puts lessons under their game, newest first, and old lessons in a section of their own', () => {
		const games = [game('g2', 'p1', 'Two', 1), game('g1', 'p1', 'One', 0)];
		const lessons = [
			lesson('a', { createdAt: 1, link: { gameId: 'g1' } }),
			lesson('b', { createdAt: 5, link: { gameId: 'g1' } }),
			lesson('L', { link: { planId: 'p1', gameId: 'L', legacy: true } }),
		];
		const sections = gameSections(games, lessons);
		expect(sections.map((s) => s.gameId)).toEqual(['g2', 'g1', 'L']);
		expect(sections[1].lessons.map((l) => l.id)).toEqual(['b', 'a']);
		expect(sections[2].game).toBeNull();
	});
});

describe('class filter', () => {
	const list = [
		lesson('a', { link: { classId: 'c1', className: 'A' } }),
		lesson('b', { link: { classId: 'c2', className: 'B' } }),
		lesson('c', { link: { classId: null, className: '' } }),
	];

	it('appears at two or more classes, "no class" counting as one', () => {
		expect(showsClassFilter([list[0]])).toBe(false);
		expect(showsClassFilter(list)).toBe(true);
		expect(
			classesOf(list)
				.map((c) => c.id)
				.sort(),
		).toEqual([FILTER_NO_CLASS, 'c1', 'c2'].sort());
	});

	it('narrows to one class or none', () => {
		expect(lessonsOfClass(list, 'c2').map((l) => l.id)).toEqual(['b']);
		expect(lessonsOfClass(list, FILTER_NO_CLASS).map((l) => l.id)).toEqual(['c']);
		expect(lessonsOfClass(list, FILTER_ALL)).toHaveLength(3);
	});
});

describe('copySources', () => {
	it('lists games, plus old lessons that have no game doc', () => {
		const old = lesson('L', { link: { planId: 'L', gameId: 'L', legacy: true } });
		const rows = buildPlanRows([old], [plan('p1', 'P')]);
		const sources = copySources(rows, new Map([['p1', [game('g1', 'p1', 'One')]]]));
		expect(sources.map((s) => `${s.kind}:${s.id}`)).toEqual(['lesson:L', 'game:g1']);
	});
});
