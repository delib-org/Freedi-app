import {
	isClassInScope,
	isTeacherInScope,
	resolveSupervisorScope,
	schoolTeacherUids,
} from '../models/agora/agoraSupervisor';
import type { SupervisorScope } from '../models/agora/agoraSupervisor';

const school = {
	schoolId: 's1',
	status: 'active' as const,
	supervisorMap: { sup: true, narrow: true },
	supervisorScopes: { narrow: { teacherIds: ['t1', 't2'] } },
};

describe('resolveSupervisorScope', () => {
	it('gives a sys-admin admin scope whatever the school says', () => {
		expect(resolveSupervisorScope({ ...school, status: 'archived' }, 'nobody', true)).toEqual({
			kind: 'admin',
		});
	});

	it('gives an attached supervisor the whole school', () => {
		expect(resolveSupervisorScope(school, 'sup', false)).toEqual({ kind: 'all', schoolId: 's1' });
	});

	it('narrows to the listed teachers', () => {
		const scope = resolveSupervisorScope(school, 'narrow', false);
		expect(scope?.kind).toBe('teachers');
		if (scope?.kind !== 'teachers') return;
		expect([...scope.teacherIds].sort()).toEqual(['t1', 't2']);
		expect(scope.schoolId).toBe('s1');
	});

	it('is null for a stranger, a plain teacher, and a supervisor of an archived school', () => {
		expect(resolveSupervisorScope(school, 'stranger', false)).toBeNull();
		expect(resolveSupervisorScope({ schoolId: 's1', status: 'active' }, 'sup', false)).toBeNull();
		expect(resolveSupervisorScope({ ...school, status: 'archived' }, 'sup', false)).toBeNull();
	});

	it('an explicit empty list means nobody', () => {
		const scope = resolveSupervisorScope(
			{ ...school, supervisorScopes: { sup: { teacherIds: [] } } },
			'sup',
			false,
		);
		expect(scope?.kind).toBe('teachers');
		expect(scope && isTeacherInScope(scope, 't1')).toBe(false);
	});
});

describe('isTeacherInScope / isClassInScope', () => {
	const admin: SupervisorScope = { kind: 'admin' };
	const all: SupervisorScope = { kind: 'all', schoolId: 's1' };
	const narrowed: SupervisorScope = {
		kind: 'teachers',
		schoolId: 's1',
		teacherIds: new Set(['t1']),
	};

	it('admin and all see every teacher; narrowed sees the listed ones', () => {
		expect(isTeacherInScope(admin, 'anyone')).toBe(true);
		expect(isTeacherInScope(all, 'anyone')).toBe(true);
		expect(isTeacherInScope(narrowed, 't1')).toBe(true);
		expect(isTeacherInScope(narrowed, 't9')).toBe(false);
	});

	it('a class must be in the school, and share a teacher under a narrowed scope', () => {
		const mine = { schoolId: 's1', teacherIds: ['t1', 't5'] };
		const theirs = { schoolId: 's1', teacherIds: ['t5'] };
		const elsewhere = { schoolId: 's2', teacherIds: ['t1'] };

		expect(isClassInScope(admin, elsewhere)).toBe(true);
		expect(isClassInScope(all, mine)).toBe(true);
		expect(isClassInScope(all, theirs)).toBe(true);
		expect(isClassInScope(all, elsewhere)).toBe(false);
		expect(isClassInScope(narrowed, mine)).toBe(true);
		expect(isClassInScope(narrowed, theirs)).toBe(false);
		expect(isClassInScope(narrowed, elsewhere)).toBe(false);
	});
});

describe('schoolTeacherUids', () => {
	it('unions the school and its classes, deduped and sorted, ignoring other schools', () => {
		const uids = schoolTeacherUids({ schoolId: 's1', teacherIds: ['t3', 't1'] }, [
			{ schoolId: 's1', teacherIds: ['t1', 't2'] },
			{ schoolId: 's2', teacherIds: ['t9'] },
			{ schoolId: 's1', teacherIds: ['t2'] },
		]);
		expect(uids).toEqual(['t1', 't2', 't3']);
	});

	it('reads an absent teacherIds as empty', () => {
		expect(schoolTeacherUids({ schoolId: 's1' }, [])).toEqual([]);
	});
});
