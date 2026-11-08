import { describe, expect, it } from 'vitest';
import {
	AgoraTopicStatus,
	type AgoraClassAggregate,
	type AgoraStudentAggregate,
	type AgoraTopicPackage,
	type TeacherConsoleMember,
} from '@freedi/shared-types';
import {
	arrangeStudents,
	bestClassLesson,
	classAverage,
	filterScenarios,
	groupByMonth,
	HOME_SCENARIO_LIMIT,
	homeScenarios,
	isSampleScenario,
	matchesLessonSearch,
	memberInitial,
	NO_SCENARIO_QUERY,
	pointsShare,
	scenarioCounts,
	scoredLessonBars,
} from '../teacherHome';

function topic(id: string, patch: Partial<AgoraTopicPackage> = {}): AgoraTopicPackage {
	return {
		topicPackageId: id,
		creatorId: 'teacher-1',
		title: id,
		status: AgoraTopicStatus.ready,
		lastUpdate: 1,
		...patch,
	} as AgoraTopicPackage;
}

describe('home shelf', () => {
	it('shows finished scenarios first, then the most recently edited, five at most', () => {
		const topics = [
			topic('draft-new', { status: AgoraTopicStatus.draft, lastUpdate: 90 }),
			topic('ready-old', { lastUpdate: 10 }),
			topic('ready-new', { lastUpdate: 50 }),
			...Array.from({ length: 6 }, (_, i) => topic(`filler-${i}`, { lastUpdate: i })),
		];
		const shown = homeScenarios(topics);
		expect(shown).toHaveLength(HOME_SCENARIO_LIMIT);
		expect(shown[0].topicPackageId).toBe('ready-new');
		expect(shown.map((entry) => entry.topicPackageId)).not.toContain('draft-new');
	});

	it('never offers the own-question lesson’s hidden scenario', () => {
		const shown = homeScenarios([topic('quick', { kind: 'quick' }), topic('real')]);
		expect(shown.map((entry) => entry.topicPackageId)).toEqual(['real']);
	});

	it('knows the scenario every new teacher is given', () => {
		expect(isSampleScenario(topic('french-revolution-teacher-1'))).toBe(true);
		expect(isSampleScenario(topic('mine'))).toBe(false);
	});
});

describe('my scenarios', () => {
	const topics = [
		topic('Rights of the child', { status: AgoraTopicStatus.draft, lastUpdate: 5 }),
		topic('French revolution', { visibility: 'public', lastUpdate: 30 }),
		topic('Bullying', { lastUpdate: 20 }),
		topic('hidden', { kind: 'quick', lastUpdate: 99 }),
	];

	it('counts what each chip would show', () => {
		expect(scenarioCounts(topics)).toEqual({ all: 3, ready: 2, draft: 1, public: 1 });
	});

	it('sorts by last edit, newest first, by default', () => {
		expect(filterScenarios(topics, NO_SCENARIO_QUERY).map((entry) => entry.title)).toEqual([
			'French revolution',
			'Bullying',
			'Rights of the child',
		]);
	});

	it('searches the title ignoring case and keeps the chip', () => {
		const found = filterScenarios(topics, { query: ' BULL', filter: 'ready', sort: 'recent' });
		expect(found.map((entry) => entry.title)).toEqual(['Bullying']);
		expect(filterScenarios(topics, { query: 'bull', filter: 'draft', sort: 'recent' })).toEqual([]);
	});

	it('sorts by name when asked', () => {
		const sorted = filterScenarios(topics, { query: '', filter: 'all', sort: 'title' });
		expect(sorted.map((entry) => entry.title)).toEqual([
			'Bullying',
			'French revolution',
			'Rights of the child',
		]);
	});
});

describe('class numbers', () => {
	const aggregate = {
		avgClassScore: 77.6,
		perGame: [
			{ sessionId: 'a', classScoreTotal: 61, playedAt: 1 },
			{ sessionId: 'b', playedAt: 2 },
			{ sessionId: 'c', classScoreTotal: 88, playedAt: 3 },
			{ sessionId: 'd', classScoreTotal: 70, playedAt: 4 },
		],
	} as unknown as AgoraClassAggregate;

	it('rounds the one headline number and says nothing when there is none', () => {
		expect(classAverage(aggregate)).toBe(78);
		expect(classAverage({ ...aggregate, avgClassScore: null })).toBeNull();
		expect(classAverage(undefined)).toBeNull();
	});

	it('finds the best scored lesson and ignores unscored ones', () => {
		expect(bestClassLesson(aggregate)?.sessionId).toBe('c');
		expect(bestClassLesson(null)).toBeNull();
		expect(scoredLessonBars(aggregate).map((row) => row.sessionId)).toEqual(['a', 'c', 'd']);
	});
});

describe('students', () => {
	const members = [
		{ memberId: 'm1', alias: 'דולפין' },
		{ memberId: 'm2', alias: 'נמר' },
		{ memberId: 'm3', alias: 'עיט' },
	] as TeacherConsoleMember[];
	const careers = new Map<string, AgoraStudentAggregate>([
		['m2', { totals: { total: 412 } } as AgoraStudentAggregate],
		['m3', { totals: { total: 290 } } as AgoraStudentAggregate],
	]);

	it('orders by alias by default', () => {
		const aliases = arrangeStudents(members, careers, { query: '', sort: 'name' }).map(
			(entry) => entry.member.alias,
		);
		expect(aliases).toEqual([...aliases].sort((a, b) => a.localeCompare(b)));
	});

	it('orders by points, with a student who has not played last', () => {
		const ids = arrangeStudents(members, careers, { query: '', sort: 'points' }).map(
			(entry) => entry.member.memberId,
		);
		expect(ids).toEqual(['m2', 'm3', 'm1']);
	});

	it('searches the alias', () => {
		const found = arrangeStudents(members, careers, { query: 'נמ', sort: 'name' });
		expect(found.map((entry) => entry.member.memberId)).toEqual(['m2']);
	});

	it('draws an avatar letter and a meter that never overflows', () => {
		expect(memberInitial('  נמר')).toBe('נ');
		expect(memberInitial('')).toBe('?');
		expect(pointsShare(206, 412)).toBe(50);
		expect(pointsShare(500, 412)).toBe(100);
		expect(pointsShare(0, 412)).toBe(0);
		expect(pointsShare(10, 0)).toBe(0);
	});
});

describe('past lessons', () => {
	it('groups newest-first rows by calendar month and keeps their order', () => {
		const rows = [
			{ id: 'a', at: new Date(2026, 2, 3).getTime() },
			{ id: 'b', at: new Date(2026, 2, 1).getTime() },
			{ id: 'c', at: new Date(2026, 1, 10).getTime() },
		];
		const groups = groupByMonth(
			rows,
			(row) => row.at,
			(at) => String(new Date(at).getMonth() + 1),
		);
		expect(groups.map((group) => group.key)).toEqual(['2026-03', '2026-02']);
		expect(groups[0].items.map((row) => row.id)).toEqual(['a', 'b']);
		expect(groups[0].label).toBe('3');
	});

	it('matches a search when every word is somewhere in the row', () => {
		const text = 'the french revolution ח2 48213';
		expect(matchesLessonSearch(text, '')).toBe(true);
		expect(matchesLessonSearch(text, 'French 482')).toBe(true);
		expect(matchesLessonSearch(text, 'french bullying')).toBe(false);
	});
});
