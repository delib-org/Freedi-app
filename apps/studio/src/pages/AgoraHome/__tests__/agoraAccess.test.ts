import { describe, expect, it } from 'vitest';
import type { TeacherConsoleDashboard } from '@freedi/shared-types';
import { accessFromDashboard } from '../useAgoraAccess';
import { pickSchoolId } from '../lastSchool';

function dashboard(over: Partial<TeacherConsoleDashboard>): TeacherConsoleDashboard {
	return {
		classes: [],
		schools: [],
		aggregates: {},
		sessions: [],
		supervisedSchools: [],
		isSystemAdmin: false,
		...over,
	};
}

describe('accessFromDashboard', () => {
	it('is no access before the dashboard arrives', () => {
		expect(accessFromDashboard(null)).toEqual({
			isTeacher: false,
			isSupervisor: false,
			supervisedSchools: [],
		});
	});

	it('is a teacher when attached to a school or holding a class', () => {
		const attached = dashboard({ schools: [{ schoolId: 's1', name: 'A' }] });
		const withClass = dashboard({
			classes: [{ classId: 'c1', name: 'C', classCode: 'X', memberCount: 1, schoolId: 's1' }],
		});
		expect(accessFromDashboard(attached).isTeacher).toBe(true);
		expect(accessFromDashboard(withClass).isTeacher).toBe(true);
	});

	it('is a coordinator when supervising an active school, and may be both', () => {
		const access = accessFromDashboard(
			dashboard({
				schools: [{ schoolId: 's1', name: 'A' }],
				supervisedSchools: [{ schoolId: 's2', name: 'B' }],
			}),
		);
		expect(access.isSupervisor).toBe(true);
		expect(access.isTeacher).toBe(true);
		expect(access.supervisedSchools).toEqual([{ schoolId: 's2', name: 'B' }]);
	});

	it('is neither for an unattached person', () => {
		const access = accessFromDashboard(dashboard({}));
		expect(access.isTeacher).toBe(false);
		expect(access.isSupervisor).toBe(false);
	});
});

describe('pickSchoolId', () => {
	const schools = [
		{ schoolId: 's1', name: 'A' },
		{ schoolId: 's2', name: 'B' },
	];

	it('prefers the URL, then the remembered school, then the first', () => {
		expect(pickSchoolId(schools, 's2', 's1')).toBe('s2');
		expect(pickSchoolId(schools, null, 's2')).toBe('s2');
		expect(pickSchoolId(schools, null, null)).toBe('s1');
	});

	it('ignores a school the person does not coordinate', () => {
		expect(pickSchoolId(schools, 'nope', 'gone')).toBe('s1');
	});

	it('is null with no schools', () => {
		expect(pickSchoolId([], 's1', 's1')).toBeNull();
	});
});
