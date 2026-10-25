import { cloneLesson } from '../fn_classCloneLesson';
import { buildLessonCopy, flattenLines, generateClassCode } from '../cloneLesson';
import { ClassroomError } from '../classroomErrors';
import { FakeFirestore } from './fakeFirestore';
import type { Statement, User } from '@freedi/shared-types';

const SRC = 'src1';
const NEW = 'new1';
const TEACHER = 'teacher';
const NOW = 1_800_000_000_000;
const CREATOR: User = { uid: TEACHER, displayName: 'T' };

function ids(): () => string {
	let i = 0;

	return () => `id${++i}`;
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
	await expect(promise).rejects.toBeInstanceOf(ClassroomError);
	await expect(promise).rejects.toMatchObject({ code });
}

/** A played lesson: plan + class work that must NOT travel. */
function seedSource(fake: FakeFirestore): void {
	fake.seed(`statements/${SRC}`, {
		statementId: SRC,
		statement: 'Phones at school',
		description: 'a short blurb',
		parentId: 'top',
		topParentId: SRC,
		statementType: 'question',
		creatorId: TEACHER,
		creator: CREATOR,
		defaultLanguage: 'he',
		forceLanguage: true,
		lastChildUpdate: 99,
		consensus: 0.7,
		statementSettings: {
			showEvaluation: false,
			lessonPlan: { steps: ['waiting'], stepIndex: 5, status: 'ended', endedAt: 5 },
			classCode: '111111',
			introVideos: [{ id: 'v1', title: 'Clip', url: 'https://youtu.be/x' }],
			videoUrl: 'https://youtu.be/legacy',
			sideNames: { a: 'Dana', b: 'Omer' },
			ballot: { closedAt: 1 },
			projectorVideoId: 'v1',
		},
	});
	fake.seed(`statementsSubscribe/${TEACHER}--${SRC}`, {
		userId: TEACHER,
		statementId: SRC,
		role: 'admin',
	});
	const q = (id: string, text: string, order: number | undefined, settings: object) =>
		fake.seed(`statements/${id}`, {
			statementId: id,
			statement: text,
			parentId: SRC,
			topParentId: SRC,
			statementType: 'question',
			createdAt: order ?? 0,
			...(order === undefined ? {} : { order }),
			hide: false,
			consensus: 0.4,
			statementSettings: settings,
		});
	q('qB', 'Second\nline', 7, { classRole: 'challenge', hint: 'think', ballot: { closedAt: 2 } });
	q('qA', 'First', 3, { classRole: 'guiding', roundPhase: 'x' });
	q('qC', 'Old unordered', undefined, {});
	fake.seed('statements/qHidden', {
		statementId: 'qHidden',
		parentId: SRC,
		statementType: 'question',
		hide: true,
		statement: 'hidden',
	});
	fake.seed('statements/qTable', {
		statementId: 'qTable',
		parentId: SRC,
		statementType: 'question',
		statement: 'a table question',
		classTable: { tableId: 't1', shared: false, coAuthors: [] },
	});
	fake.seed('statements/p2', {
		statementId: 'p2',
		parentId: SRC,
		statementType: 'paragraph',
		statement: 'item one\nitem two',
		order: 1,
		blockType: 'li',
		doc: { order: 1, paragraphType: 'li', listType: 'ul' },
	});
	fake.seed('statements/p1', {
		statementId: 'p1',
		parentId: SRC,
		statementType: 'paragraph',
		statement: 'Intro text',
		order: 0,
		blockType: 'paragraph',
	});
	fake.seed('statements/opt1', {
		statementId: 'opt1',
		parentId: 'qA',
		statementType: 'option',
		statement: 'a student proposal',
	});
}

describe('flattenLines + generateClassCode', () => {
	it('turns line breaks into single spaces', () => {
		expect(flattenLines('a\r\nb\n\n c ')).toBe('a b c');
	});

	it('makes six digits', () => {
		expect(generateClassCode(() => 0.55)).toBe('555555');
		expect(generateClassCode()).toMatch(/^\d{6}$/);
	});
});

describe('buildLessonCopy (allowlist mapper)', () => {
	function build(title?: string) {
		const fake = new FakeFirestore();
		seedSource(fake);
		const source = fake.read(`statements/${SRC}`) as unknown as Statement;
		const children = fake
			.list('statements')
			.filter((s) => s.parentId === SRC) as unknown as Statement[];

		return buildLessonCopy({
			source,
			children,
			newMainId: NEW,
			title,
			creator: CREATOR,
			classCode: '424242',
			now: NOW,
			newId: ids(),
		});
	}

	it('builds a new live lesson at step 0 with the new code and the source link', () => {
		const { main } = build();
		expect(main).toMatchObject({
			statementId: NEW,
			statement: 'Phones at school',
			parentId: 'top',
			topParentId: NEW,
			parents: [],
			creatorId: TEACHER,
			createdAt: NOW,
			lastUpdate: NOW,
			defaultLanguage: 'he',
			forceLanguage: true,
			description: 'a short blurb',
			sourceLessonId: SRC,
			sourceLessonTitle: 'Phones at school',
			membership: { access: 'openToAll' },
		});
		const settings = main.statementSettings;
		expect(settings?.classCode).toBe('424242');
		expect(settings?.lessonPlan).toMatchObject({ stepIndex: 0, status: 'live', statusAt: NOW });
		expect(settings?.lessonPlan).not.toHaveProperty('endedAt');
		expect(settings?.introVideos).toEqual([{ id: 'v1', title: 'Clip', url: 'https://youtu.be/x' }]);
		expect(settings?.videoUrl).toBe('https://youtu.be/legacy');
		expect(settings?.sideNames).toEqual({ a: 'Dana', b: 'Omer' });
		// the source's own showEvaluation:false is not copied; the defaults are
		expect(settings?.showEvaluation).toBe(true);
	});

	it('never copies class work or progress fields', () => {
		const { main, questions } = build();
		const dump = JSON.stringify({ main, questions });
		for (const banned of ['ballot', 'roundPhase', 'projectorVideoId', 'endedAt', '111111']) {
			expect(dump).not.toContain(banned);
		}
		expect(main).not.toHaveProperty('lastChildUpdate');
		expect(main.consensus).toBe(0);
		for (const q of questions) expect(q.consensus).toBe(0);
		expect(main.hide).toBe(false);
	});

	it('uses a given title and falls back to the source title', () => {
		expect(build('Second class').main.statement).toBe('Second class');
		expect(build('  ').main.statement).toBe('Phones at school');
		expect(build('Second class').main.sourceLessonTitle).toBe('Phones at school');
	});

	it('copies the questions in manual order, renumbered 0..n-1, hidden and table ones left out', () => {
		const { questions } = build();
		expect(questions.map((q) => q.statement)).toEqual(['First', 'Second line', 'Old unordered']);
		expect(questions.map((q) => q.order)).toEqual([0, 1, 2]);
		expect(questions.map((q) => q.parentId)).toEqual([NEW, NEW, NEW]);
		expect(questions.every((q) => q.topParentId === NEW && q.parents?.join() === NEW)).toBe(true);
		expect(questions[1].statementSettings).toMatchObject({ classRole: 'challenge', hint: 'think' });
		expect(questions[0].statementSettings?.classRole).toBe('guiding');
		expect(questions[2].statementSettings).not.toHaveProperty('classRole');
		expect(questions.some((q) => q.classTable)).toBe(false);
	});

	it('copies the intro paragraphs with order, block type and doc, flattened', () => {
		const { paragraphs } = build();
		expect(paragraphs.map((p) => p.statement)).toEqual(['Intro text', 'item one item two']);
		expect(paragraphs.map((p) => p.order)).toEqual([0, 1]);
		expect(paragraphs[1]).toMatchObject({
			statementType: 'paragraph',
			blockType: 'li',
			parentId: NEW,
			topParentId: NEW,
			doc: { order: 1, paragraphType: 'li', listType: 'ul' },
		});
		expect(paragraphs[0].doc).toBeUndefined();
	});

	it('gives every new statement a fresh id and no newlines', () => {
		const { main, questions, paragraphs } = build();
		const all = [main, ...questions, ...paragraphs];
		expect(new Set(all.map((s) => s.statementId)).size).toBe(all.length);
		expect(all.some((s) => s.statement.includes('\n'))).toBe(false);
	});

	it('refuses a plan over the caps', () => {
		const fake = new FakeFirestore();
		seedSource(fake);
		const source = fake.read(`statements/${SRC}`) as unknown as Statement;
		const many = Array.from({ length: 51 }, (_, i) => ({
			statementId: `x${i}`,
			statement: 'q',
			parentId: SRC,
			statementType: 'question',
		})) as unknown as Statement[];
		expect(() =>
			buildLessonCopy({
				source,
				children: many,
				newMainId: NEW,
				creator: CREATOR,
				classCode: '1',
				now: NOW,
				newId: ids(),
			}),
		).toThrow(ClassroomError);
	});
});

describe('classCloneLesson', () => {
	const run = (fake: FakeFirestore, uid = TEACHER, req = { sourceMainId: SRC, newMainId: NEW }) =>
		cloneLesson(
			fake.asFirestore(),
			uid,
			req,
			() => NOW,
			() => 0.25,
			ids(),
		);

	it('creates the lesson, its questions, paragraphs and code in one go; nothing else', async () => {
		const fake = new FakeFirestore();
		seedSource(fake);
		const before = fake.list('statements').length;
		const res = await run(fake);
		expect(res).toEqual({ mainId: NEW, classCode: '222222', reused: false });
		expect(fake.read('classCodes/222222')).toEqual({ mainId: NEW, createdAt: NOW });
		// main + 3 questions + 2 paragraphs
		expect(fake.list('statements').length).toBe(before + 6);
		expect(fake.read(`statements/${NEW}`)).toMatchObject({ sourceLessonId: SRC });
		// no subscription for the new lesson, no student data
		expect(fake.read(`statementsSubscribe/${TEACHER}--${NEW}`)).toBeUndefined();
		// the source and its code are untouched
		expect(fake.read(`statements/${SRC}`)?.statementSettings).toMatchObject({
			classCode: '111111',
			lessonPlan: { stepIndex: 5, status: 'ended' },
		});
	});

	it('is idempotent on newMainId: the second call returns the same lesson', async () => {
		const fake = new FakeFirestore();
		seedSource(fake);
		await run(fake);
		const count = fake.list('statements').length;
		const again = await run(fake);
		expect(again).toEqual({ mainId: NEW, classCode: '222222', reused: true });
		expect(fake.list('statements').length).toBe(count);
	});

	it('refuses a taken id that is not a copy of this source by this teacher', async () => {
		const fake = new FakeFirestore();
		seedSource(fake);
		fake.seed(`statements/${NEW}`, { statementId: NEW, creatorId: 'someone' });
		await expectCode(run(fake), 'already-exists');
	});

	it('refuses a teacher who does not own the source, before reading its children', async () => {
		const fake = new FakeFirestore();
		seedSource(fake);
		const queried: string[] = [];
		const original = fake.query.bind(fake);
		fake.query = ((collection: string, filters?: [string, unknown][]) => {
			queried.push(collection);

			return original(collection, filters);
		}) as typeof fake.query;
		await expectCode(run(fake, 'stranger'), 'permission-denied');
		expect(queried).toEqual([]);
	});

	it('refuses a student of the lesson', async () => {
		const fake = new FakeFirestore();
		seedSource(fake);
		fake.seed(`statementsSubscribe/s1--${SRC}`, { userId: 's1', statementId: SRC, role: 'member' });
		await expectCode(run(fake, 's1'), 'permission-denied');
	});

	it('refuses a missing source, a non-lesson and bad arguments', async () => {
		const fake = new FakeFirestore();
		await expectCode(run(fake), 'not-found');
		seedSource(fake);
		fake.seed('statements/plain', {
			statementId: 'plain',
			parentId: 'top',
			creatorId: TEACHER,
			creator: CREATOR,
			statement: 'x',
			statementSettings: {},
		});
		await expectCode(
			run(fake, TEACHER, { sourceMainId: 'plain', newMainId: NEW }),
			'failed-precondition',
		);
		await expectCode(run(fake, TEACHER, { sourceMainId: SRC, newMainId: SRC }), 'invalid-argument');
		await expectCode(run(fake, TEACHER, { sourceMainId: SRC, newMainId: '' }), 'invalid-argument');
		await expectCode(
			cloneLesson(fake.asFirestore(), TEACHER, {
				sourceMainId: SRC,
				newMainId: NEW,
				title: 5 as unknown as string,
			}),
			'invalid-argument',
		);
	});

	it('picks another code when the first is taken, and gives up after the attempts', async () => {
		const fake = new FakeFirestore();
		seedSource(fake);
		fake.seed('classCodes/222222', { mainId: 'other', createdAt: 1 });
		const seq = [0.2, 0.3];
		let call = 0;
		// six digits per code: first code 222222 (taken), second 333333
		const rng = () => seq[Math.floor(call++ / 6)] ?? 0.4;
		const res = await cloneLesson(
			fake.asFirestore(),
			TEACHER,
			{ sourceMainId: SRC, newMainId: NEW },
			() => NOW,
			rng,
			ids(),
		);
		expect(res.classCode).toBe('333333');
		expect(fake.read('classCodes/222222')).toMatchObject({ mainId: 'other' });

		const full = new FakeFirestore();
		seedSource(full);
		full.seed('classCodes/222222', { mainId: 'other', createdAt: 1 });
		await expectCode(run(full), 'resource-exhausted');
	});
});
