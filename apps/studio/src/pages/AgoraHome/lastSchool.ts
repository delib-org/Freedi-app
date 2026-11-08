import type { TeacherConsoleDashboard } from '@freedi/shared-types';

/** The coordinator's last school pick, kept per browser so `/agora` reopens on it. */
const STORAGE_KEY = 'studio.agora.lastSchool';

export function readLastSchool(): string | null {
	try {
		return window.localStorage.getItem(STORAGE_KEY);
	} catch {
		// Private windows and blocked storage: the first school is a fine default.
		return null;
	}
}

export function rememberSchool(schoolId: string): void {
	try {
		window.localStorage.setItem(STORAGE_KEY, schoolId);
	} catch {
		// Not remembering a convenience is not an error.
	}
}

/** The school to show: the URL's pick, else the remembered one, else the first. */
export function pickSchoolId(
	schools: TeacherConsoleDashboard['supervisedSchools'],
	fromUrl: string | null,
	remembered: string | null,
): string | null {
	const known = (id: string | null) => !!id && schools.some((school) => school.schoolId === id);
	if (known(fromUrl)) return fromUrl;
	if (known(remembered)) return remembered;

	return schools[0]?.schoolId ?? null;
}
