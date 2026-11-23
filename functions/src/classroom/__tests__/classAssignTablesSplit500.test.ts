import { CLASS_SIDES_COLLECTION, CLASS_TABLES_COLLECTION } from '@freedi/shared-types';
import type { ClassTable } from '@freedi/shared-types';
import { assignTables } from '../fn_classAssignTables';
import { classSideRef } from '../classSides';
import { FakeFirestore } from './fakeFirestore';

/**
 * Trello gLyqJGvZ: "the teacher could not split the class into tables" (HTTP 500,
 * `internal`). Two ways the split used to die without a word:
 *  - functions installs @freedi/shared-types from a packed .tgz; a copy packed before
 *    the private sides existed has no CLASS_SIDES_COLLECTION, so `collection(undefined)`
 *    threw "Path must be a non-empty string" inside the transaction. Fix: `npm run prebuild`
 *    in functions/ (re-packs shared-types).
 *  - a member subscription without a userId put `undefined` into a table's memberUids.
 */

const MAIN = 'lesson1';
const TEACHER = 'teacher';
const STEPS = ['waiting', 'opening', 'side', 'tables', 'tableTalk', 'proposals', 'vote', 'summary'];

function seedLesson(fake: FakeFirestore, students: number): void {
	fake.seed(`statements/${MAIN}`, {
		statementId: MAIN,
		parentId: 'top',
		topParentId: MAIN,
		statementType: 'question',
		creatorId: TEACHER,
		statementSettings: { lessonPlan: { steps: STEPS, stepIndex: 3 } },
	});
	fake.seed(`statementsSubscribe/${TEACHER}--${MAIN}`, {
		userId: TEACHER,
		statementId: MAIN,
		role: 'admin',
	});
	for (let i = 1; i <= students; i++) {
		fake.seed(`statementsSubscribe/s${i}--${MAIN}`, {
			userId: `s${i}`,
			statementId: MAIN,
			role: 'member',
		});
	}
}

describe('the installed @freedi/shared-types is not stale (Trello gLyqJGvZ)', () => {
	it('exports the collection names the classroom engine reads (else: run `npm run prebuild` in functions/)', () => {
		expect(typeof CLASS_SIDES_COLLECTION).toBe('string');
		expect(CLASS_SIDES_COLLECTION.length).toBeGreaterThan(0);
		expect(typeof CLASS_TABLES_COLLECTION).toBe('string');
		expect(CLASS_TABLES_COLLECTION.length).toBeGreaterThan(0);
	});

	it('builds a side ref without throwing', () => {
		const fake = new FakeFirestore();
		expect(() => classSideRef(fake.asFirestore(), MAIN, 's1')).not.toThrow();
	});
});

describe('classAssignTables on a small, half-joined class', () => {
	it('seats 4 students who picked no side', async () => {
		const fake = new FakeFirestore();
		seedLesson(fake, 4);
		const result = await assignTables(fake.asFirestore(), TEACHER, { mainId: MAIN });
		expect(result).toEqual({ tables: 1, placed: 4 });
	});

	it('seats the class when a member subscription has no userId, and leaves it unseated', async () => {
		const fake = new FakeFirestore();
		seedLesson(fake, 4);
		fake.seed('statementsSubscribe/broken', { statementId: MAIN, role: 'member' });
		const result = await assignTables(fake.asFirestore(), TEACHER, { mainId: MAIN });
		expect(result).toEqual({ tables: 1, placed: 4 });
		const tables = fake.list(CLASS_TABLES_COLLECTION) as unknown as ClassTable[];
		for (const uid of tables.flatMap((t) => t.memberUids)) {
			expect(typeof uid).toBe('string');
		}
	});
});
