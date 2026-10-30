// The package's setup mocks valibot; these tests need the real schema checks.
jest.unmock('valibot');

import { parse } from 'valibot';
import {
	CLASS_GAME_MAX_QUESTIONS,
	CLASS_GAME_MAX_TEXT_LENGTH,
	CLASS_NAME_MAX_LENGTH,
	LESSON_NAME_MAX_LENGTH,
	ClassGameSchema,
	ClassPlanSchema,
	classHomeIdOf,
	cleanClassName,
	cleanLessonName,
	isClassHome,
	isClassLesson,
	isHomeId,
	teacherHomeIdOf,
} from '../models/classroom/classPlanModel';
import type { ClassGameSnapshot } from '../models/classroom/classPlanModel';
import {
	LESSON_STEPS,
	checkSnapshot,
	lessonFromSnapshot,
	snapshotFromLesson,
} from '../models/classroom/classGameSnapshot';
import { StatementSettingsSchema } from '../models/statement/StatementSettings';
import { AgoraClassSchema } from '../models/agora/agoraClassroom';
import type { Statement } from '../models/statement/StatementTypes';

const NOW = 1_800_000_000_000;
const TEACHER = { uid: 'teacher', displayName: 'T' };
const SRC = 'src1';

function ids(): () => string {
	let i = 0;

	return () => `id${++i}`;
}

function st(partial: Record<string, unknown> & { statementId: string }): Statement {
	return {
		statement: 'x',
		parentId: SRC,
		topParentId: SRC,
		statementType: 'question',
		creatorId: TEACHER.uid,
		creator: TEACHER,
		createdAt: 0,
		lastUpdate: 0,
		consensus: 0,
		...partial,
	} as unknown as Statement;
}

const source = st({
	statementId: SRC,
	statement: 'Phones at school',
	parentId: 'top',
	description: 'blurb\nline',
	defaultLanguage: 'he',
	forceLanguage: true,
	statementSettings: {
		showEvaluation: false,
		lessonPlan: { steps: ['waiting'], stepIndex: 5, status: 'ended', endedAt: 5 },
		classCode: '111111',
		introVideos: [{ id: 'v1', title: 'Clip', url: 'https://youtu.be/x' }],
		sideNames: { a: 'Dana', b: 'Omer' },
		sideQuestion: 'Must Dana invite Omer?',
		sideClaims: { a: 'She must', b: 'She may not' },
		allowOwnQuestions: false,
		speakSeconds: 90,
		proposalsTurns: 2,
		tableSize: 4,
		ballot: { closedAt: 1 },
	},
});

const children: Statement[] = [
	st({
		statementId: 'qB',
		statement: 'Second\nline',
		order: 7,
		statementSettings: { classRole: 'challenge', hint: 'think' },
	}),
	st({
		statementId: 'qA',
		statement: 'First',
		order: 3,
		statementSettings: { classRole: 'guiding' },
	}),
	st({ statementId: 'qHidden', statement: 'hidden', hide: true }),
	st({ statementId: 'qEmpty', statement: '  ' }),
	st({
		statementId: 'qTable',
		statement: 'table q',
		classTable: { tableId: 't1', shared: false, coAuthors: [] },
	}),
	st({
		statementId: 'p1',
		statement: 'Intro text',
		statementType: 'paragraph',
		order: 0,
		blockType: 'paragraph',
	}),
	st({
		statementId: 'p2',
		statement: 'item one\nitem two',
		statementType: 'paragraph',
		order: 1,
		blockType: 'li',
		doc: { order: 1, paragraphType: 'li', listType: 'ul' },
	}),
	st({ statementId: 'opt1', statement: 'student words', parentId: 'qA', statementType: 'option' }),
];

describe('class plan model', () => {
	it('names homes and recognises them', () => {
		expect(classHomeIdOf('c1')).toBe('jcClass_c1');
		expect(teacherHomeIdOf('u1')).toBe('jcTeacher_u1');
		expect(isHomeId('jcClass_c1')).toBe(true);
		expect(isHomeId('jcTeacher_u1')).toBe(true);
		expect(isHomeId('lesson1')).toBe(false);
	});

	it('tells a home from a lesson, old or new', () => {
		const home = { statementSettings: { classHome: { kind: 'class', classId: 'c' } } };
		expect(isClassHome(home)).toBe(true);
		expect(isClassLesson(home)).toBe(false);
		expect(isClassLesson({ statementSettings: { lessonPlan: {} } })).toBe(true);
		expect(
			isClassLesson({ statementSettings: { lessonPlan: {}, classHome: { kind: 'teacher' } } }),
		).toBe(false);
		expect(isClassLesson({ statementSettings: {} })).toBe(false);
		expect(isClassLesson(undefined)).toBe(false);
		expect(isClassHome(null)).toBe(false);
	});

	it('cleans a class name to one capped line', () => {
		expect(cleanClassName('  ט׳2 \n ')).toBe('ט׳2');
		expect(cleanClassName('a'.repeat(100))).toHaveLength(CLASS_NAME_MAX_LENGTH);
	});

	it('parses plans and keeps statement settings without the new fields valid', () => {
		const plan = { planId: 'p', title: 't', ownerUid: 'u', createdAt: 1, lastUpdate: 2 };
		expect(parse(ClassPlanSchema, plan)).toEqual(plan);
		expect(() => parse(StatementSettingsSchema, {})).not.toThrow();
		const out = parse(StatementSettingsSchema, {
			classLesson: { planId: 'p', gameId: 'g', classId: null, className: '' },
			classHome: { kind: 'anything-new', uid: 'u' },
		});
		expect(out.classLesson?.classId).toBeNull();
		expect(out.classHome?.kind).toBe('anything-new');
	});

	it('accepts an Agora class with and without joinClassHomeId', () => {
		const cls = {
			classId: 'c',
			schoolId: 's',
			name: 'ט׳2',
			teacherIds: ['t'],
			teacherMap: { t: true },
			classCode: 'ABCDEF',
			memberCount: 0,
			status: 'active',
			createdBy: 'a',
			createdAt: 1,
			lastUpdate: 1,
		};
		expect(() => parse(AgoraClassSchema, cls)).not.toThrow();
		expect(parse(AgoraClassSchema, { ...cls, joinClassHomeId: 'jcClass_c' }).joinClassHomeId).toBe(
			'jcClass_c',
		);
	});
});

describe('snapshotFromLesson', () => {
	const snap = snapshotFromLesson(source, children);

	it('takes the visible plan questions in manual order, renumbered, flattened', () => {
		expect(snap.questions).toEqual([
			{ key: 'qA', text: 'First', order: 0, classRole: 'guiding' },
			{ key: 'qB', text: 'Second line', order: 1, classRole: 'challenge', hint: 'think' },
		]);
	});

	it('takes the intro paragraphs with their block and list types', () => {
		expect(snap.paragraphs).toEqual([
			{ key: 'p1', text: 'Intro text', order: 0, blockType: 'paragraph' },
			{ key: 'p2', text: 'item one item two', order: 1, blockType: 'li', listType: 'ul' },
		]);
	});

	it('takes the whitelisted settings and nothing of the class work', () => {
		expect(snap.settings).toEqual({
			speakSeconds: 90,
			proposalsTurns: 2,
			tableSize: 4,
			allowOwnQuestions: false,
			sideQuestion: 'Must Dana invite Omer?',
		});
		expect(snap.sideNames).toEqual({ a: 'Dana', b: 'Omer' });
		expect(snap.sideClaims).toEqual({ a: 'She must', b: 'She may not' });
		expect(snap.introVideos).toHaveLength(1);
		expect(snap.description).toBe('blurb line');
		expect(snap.defaultLanguage).toBe('he');
		const dump = JSON.stringify(snap);
		for (const banned of ['ballot', '111111', 'endedAt', 'student words', 'table q', 'hidden']) {
			expect(dump).not.toContain(banned);
		}
		expect(checkSnapshot(snap).ok).toBe(true);
	});
});

describe('checkSnapshot', () => {
	const base: ClassGameSnapshot = {
		questions: [],
		paragraphs: [],
		introVideos: [],
		settings: {},
	};

	it('refuses a wrong shape and drops unknown keys', () => {
		expect(checkSnapshot({ questions: 'no' })).toEqual({ ok: false, problem: 'invalid' });
		expect(checkSnapshot(null)).toEqual({ ok: false, problem: 'invalid' });
		const res = checkSnapshot({ ...base, evil: 1 });
		expect(res.ok && 'evil' in res.snapshot).toBe(false);
	});

	it('refuses too many questions and too long texts', () => {
		const many = Array.from({ length: CLASS_GAME_MAX_QUESTIONS + 1 }, (_, i) => ({
			key: `k${i}`,
			text: 'q',
			order: i,
		}));
		expect(checkSnapshot({ ...base, questions: many })).toEqual({ ok: false, problem: 'too-big' });
		const long = [{ key: 'k', text: 'x'.repeat(CLASS_GAME_MAX_TEXT_LENGTH + 1), order: 0 }];
		expect(checkSnapshot({ ...base, questions: long })).toEqual({ ok: false, problem: 'too-big' });
	});
});

describe('lessonFromSnapshot', () => {
	const HOME = 'jcClass_c1';
	const LESSON = 'L1';
	const build = (snapshot = snapshotFromLesson(source, children)) =>
		lessonFromSnapshot({
			snapshot,
			homeId: HOME,
			lessonId: LESSON,
			title: 'Report\nor keep quiet?',
			creator: TEACHER,
			classCode: '424242',
			now: NOW,
			newId: ids(),
			classLesson: { planId: 'p', gameId: 'g', classId: 'c1', className: 'ט׳2' },
		});

	it('puts the lesson under the home, live at Waiting, with its code and link', () => {
		const out = build();
		expect(out).toBeDefined();
		const main = out!.main;
		expect(main).toMatchObject({
			statementId: LESSON,
			statement: 'Report or keep quiet?',
			statementType: 'question',
			parentId: HOME,
			topParentId: HOME,
			parents: [HOME],
			creatorId: TEACHER.uid,
			createdAt: NOW,
			membership: { access: 'openToAll' },
			defaultLanguage: 'he',
			forceLanguage: true,
			description: 'blurb line',
		});
		expect(main.statementSettings).toMatchObject({
			classCode: '424242',
			lessonPlan: { steps: [...LESSON_STEPS], stepIndex: 0, status: 'live', statusAt: NOW },
			classLesson: { planId: 'p', gameId: 'g', classId: 'c1', className: 'ט׳2' },
			sideNames: { a: 'Dana', b: 'Omer' },
			speakSeconds: 90,
			proposalsTurns: 2,
			tableSize: 4,
			allowOwnQuestions: false,
			showEvaluation: true,
		});
		expect(main.statementSettings).not.toHaveProperty('classHome');
		expect(main).not.toHaveProperty('sourceLessonId');
	});

	it('chains the questions and paragraphs under the lesson and the home', () => {
		const out = build()!;
		expect(out.questions.map((q) => q.statement)).toEqual(['First', 'Second line']);
		for (const s of [...out.questions, ...out.paragraphs]) {
			expect(s.parentId).toBe(LESSON);
			expect(s.topParentId).toBe(HOME);
			expect(s.parents).toEqual([HOME, LESSON]);
		}
		expect(out.questions[1].statementSettings).toMatchObject({
			classRole: 'challenge',
			hint: 'think',
		});
		expect(out.paragraphs[1]).toMatchObject({
			blockType: 'li',
			doc: { order: 1, paragraphType: 'li', listType: 'ul' },
		});
		const all = [out.main, ...out.questions, ...out.paragraphs];
		expect(new Set(all.map((s) => s.statementId)).size).toBe(all.length);
	});

	it('flattens a client-written snapshot, drops a bad role and skips empty rows', () => {
		const out = build({
			questions: [
				{ key: 'a', text: 'one\ntwo', order: 1, classRole: 'boss', hint: 'h\ni' },
				{ key: 'b', text: '   ', order: 0 },
			],
			paragraphs: [{ key: 'p', text: '', order: 0 }],
			introVideos: [],
			settings: { tableSize: 99 },
		})!;
		expect(out.questions).toHaveLength(1);
		expect(out.questions[0].statement).toBe('one two');
		expect(out.questions[0].statementSettings).not.toHaveProperty('classRole');
		expect(out.questions[0].statementSettings?.hint).toBe('h i');
		expect(out.paragraphs).toHaveLength(0);
		expect(out.main.statementSettings?.tableSize).toBeLessThanOrEqual(8);
	});

	it('refuses an empty title and stamps the source when copied from a lesson', () => {
		expect(
			lessonFromSnapshot({
				snapshot: snapshotFromLesson(source, []),
				homeId: HOME,
				lessonId: LESSON,
				title: ' \n ',
				creator: TEACHER,
				classCode: '1',
				now: NOW,
				newId: ids(),
			}),
		).toBeUndefined();
		const copied = lessonFromSnapshot({
			snapshot: snapshotFromLesson(source, []),
			homeId: HOME,
			lessonId: LESSON,
			title: 'x',
			creator: TEACHER,
			classCode: '1',
			now: NOW,
			newId: ids(),
			sourceLesson: { id: SRC, title: 'Phones\nat school' },
		})!;
		expect(copied.main).toMatchObject({
			sourceLessonId: SRC,
			sourceLessonTitle: 'Phones at school',
		});
		expect(copied.main.statementSettings).not.toHaveProperty('classLesson');
	});

	it('parses as a game doc', () => {
		const game = {
			gameId: 'g',
			planId: 'p',
			ownerUid: 'u',
			title: 't',
			order: 0,
			snapshot: snapshotFromLesson(source, children),
			createdAt: 1,
			lastUpdate: 1,
		};
		expect(() => parse(ClassGameSchema, game)).not.toThrow();
	});
});

describe('cleanLessonName', () => {
	it('trims and collapses to one line', () => {
		expect(cleanLessonName('  a \n b  ')).toBe('a b');
	});

	it('caps at the limit and returns empty for non-strings', () => {
		expect(cleanLessonName('a'.repeat(200))).toHaveLength(LESSON_NAME_MAX_LENGTH);
		expect(cleanLessonName(undefined)).toBe('');
		expect(cleanLessonName(5)).toBe('');
	});
});
