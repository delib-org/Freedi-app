import type {
	ClassGameSnapshot,
	ClassStartLessonRequest,
	Statement,
	User,
} from '@freedi/shared-types';
import { LESSON_NAME_MAX_LENGTH } from '@freedi/shared-types';
import { lessonNameOf, startLesson } from '../fn_classStartLesson';
import type { StartLessonCallDeps } from '../fn_classStartLesson';
import { FakeFirestore } from './fakeFirestore';

const TEACHER: User = { uid: 'teacher', displayName: 'Tal' };
const NOW = 1_800_000_000_000;
const PLAN = 'plan1';
const GAME = 'game1';
const CLASS = 'class92';
const GAME_TITLE = 'בריונות';

const SNAPSHOT: ClassGameSnapshot = {
	questions: [{ key: 'a', text: 'Why?', order: 0, classRole: 'guiding' }],
	paragraphs: [],
	introVideos: [],
	settings: { tableSize: 4 },
};

function deps(): StartLessonCallDeps {
	let i = 0;

	return {
		now: () => NOW,
		random: () => 0.25,
		newId: () => `id${++i}`,
		resolveUsers: async (uids) => uids.map((uid) => ({ uid, displayName: uid })),
		assertApprovedTeacher: async () => undefined,
	};
}

function seed(fake: FakeFirestore): void {
	fake.seed(`classPlans/${PLAN}`, {
		planId: PLAN,
		title: 'Plan',
		ownerUid: TEACHER.uid,
		createdAt: 1,
		lastUpdate: 1,
	});
	fake.seed(`classPlans/${PLAN}/games/${GAME}`, {
		gameId: GAME,
		planId: PLAN,
		ownerUid: TEACHER.uid,
		title: GAME_TITLE,
		order: 0,
		snapshot: SNAPSHOT,
		createdAt: 1,
		lastUpdate: 1,
	});
	fake.seed(`agoraClasses/${CLASS}`, {
		classId: CLASS,
		schoolId: 's1',
		name: 'ט׳3',
		teacherIds: [TEACHER.uid],
		teacherMap: { [TEACHER.uid]: true },
		classCode: 'ABCDEF',
		memberCount: 0,
		status: 'active',
		createdBy: 'admin',
		createdAt: 1,
		lastUpdate: 1,
	});
}

const req = (overrides: Partial<ClassStartLessonRequest> = {}): ClassStartLessonRequest => ({
	planId: PLAN,
	gameId: GAME,
	classId: CLASS,
	newMainId: 'lesson1',
	...overrides,
});

async function started(request: ClassStartLessonRequest): Promise<Statement> {
	const fake = new FakeFirestore();
	seed(fake);
	await startLesson(fake.asFirestore(), TEACHER, request, deps());

	return fake.read(`statements/${request.newMainId}`) as unknown as Statement;
}

describe('classStartLesson lessonName', () => {
	it('stores the name the teacher gave, trimmed', async () => {
		const lesson = await started(req({ lessonName: '  בריונות עם ט 3  ' }));
		expect(lesson.statementSettings?.classLesson?.lessonName).toBe('בריונות עם ט 3');
		// students still see the game title
		expect(lesson.statement).toBe(GAME_TITLE);
	});

	it('caps the name', async () => {
		const lesson = await started(req({ lessonName: 'x'.repeat(LESSON_NAME_MAX_LENGTH + 50) }));
		expect(lesson.statementSettings?.classLesson?.lessonName).toHaveLength(LESSON_NAME_MAX_LENGTH);
	});

	it('falls back to "<game> עם <class>" when an old client sends none', async () => {
		const lesson = await started(req());
		expect(lesson.statementSettings?.classLesson?.lessonName).toBe('בריונות עם ט׳3');
	});

	it('falls back to the game title with no class and treats a blank name as missing', async () => {
		const lesson = await started(req({ classId: null, lessonName: '   ' }));
		expect(lesson.statementSettings?.classLesson?.lessonName).toBe(GAME_TITLE);
	});
});

describe('lessonNameOf', () => {
	it('ignores a non-string name', () => {
		expect(lessonNameOf(42, 'Game', '')).toBe('Game');
	});

	it('collapses inner whitespace to one line', () => {
		expect(lessonNameOf('a\n  b', 'Game', '')).toBe('a b');
	});
});
