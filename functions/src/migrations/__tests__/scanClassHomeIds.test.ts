import { describe, it, expect } from '@jest/globals';
import type { Statement } from '@freedi/shared-types';
import { classifyHomeIdDoc, formatHomeIdScan } from '../scanClassHomeIds';

const doc = (over: Record<string, unknown>) =>
	({ parentId: 'top', ...over }) as unknown as Partial<Statement> & { statementId: string };

describe('classifyHomeIdDoc', () => {
	it('accepts a teacher home made by that teacher', () => {
		const f = classifyHomeIdDoc(
			doc({
				statementId: 'jcTeacher_t1',
				creatorId: 't1',
				statementSettings: { classHome: { kind: 'teacher', uid: 't1' } },
			}),
			undefined,
		);
		expect(f).toMatchObject({ verdict: 'genuine', kind: 'teacher' });
	});

	it('flags teacher-home squats: other creator, mismatched link, no link, not top-level', () => {
		const link = { classHome: { kind: 'teacher', uid: 't1' } };
		const cases = [
			doc({ statementId: 'jcTeacher_t1', creatorId: 'evil', statementSettings: link }),
			doc({
				statementId: 'jcTeacher_t1',
				creatorId: 't1',
				statementSettings: { classHome: { kind: 'teacher', uid: 't2' } },
			}),
			doc({ statementId: 'jcTeacher_t1', creatorId: 't1', statementSettings: {} }),
			doc({ statementId: 'jcTeacher_t1', creatorId: 't1', parentId: 'x', statementSettings: link }),
		];
		for (const c of cases) expect(classifyHomeIdDoc(c, undefined).verdict).toBe('squat');
	});

	it('accepts a class home the class links to, or made by its teacher; flags the rest', () => {
		const home = doc({
			statementId: 'jcClass_c1',
			creatorId: 'gone',
			statementSettings: { classHome: { kind: 'class', classId: 'c1' } },
		});
		expect(
			classifyHomeIdDoc(home, { teacherIds: ['t1'], joinClassHomeId: 'jcClass_c1' }).verdict,
		).toBe('genuine');
		expect(classifyHomeIdDoc({ ...home, creatorId: 't1' }, { teacherIds: ['t1'] }).verdict).toBe(
			'genuine',
		);
		expect(classifyHomeIdDoc(home, { teacherIds: ['t1'] }).verdict).toBe('squat');
		expect(classifyHomeIdDoc(home, undefined).reason).toBe('no such Agora class');
		const report = formatHomeIdScan([classifyHomeIdDoc(home, undefined)]);
		expect(report).toContain('SQUAT jcClass_c1');
		expect(report).toContain('1 squat(s)');
	});
});
