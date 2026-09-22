import { HttpsError } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	AgoraSchool,
	Collections,
	SupervisorScope,
	resolveSupervisorScope,
} from '@freedi/shared-types';
import { isSystemAdmin } from '../utils/httpAuth';

/**
 * The reads behind `resolveSupervisorScope` — who this caller is to this
 * school. The pure decision lives in shared-types; this adds the two lookups
 * (the sys-admin flag, the school doc) and nothing else.
 */

/** The caller's scope on a school, or null when they hold none (or it is missing). */
export async function supervisorScopeFor(
	uid: string,
	schoolId: string,
): Promise<{ scope: SupervisorScope | null; school: AgoraSchool | null; isAdmin: boolean }> {
	const [isAdmin, schoolSnap] = await Promise.all([
		isSystemAdmin(uid),
		db.collection(Collections.agoraSchools).doc(schoolId).get(),
	]);
	const school = (schoolSnap.data() as AgoraSchool | undefined) ?? null;
	if (!school) return { scope: isAdmin ? { kind: 'admin' } : null, school: null, isAdmin };

	return { scope: resolveSupervisorScope(school, uid, isAdmin), school, isAdmin };
}

/**
 * The active schools this caller may pick in the overview: every one for a
 * sys-admin, else the ones whose `supervisorMap` names them. Sorted by name.
 */
export async function supervisedSchools(uid: string, isAdmin: boolean): Promise<AgoraSchool[]> {
	const query = isAdmin
		? db.collection(Collections.agoraSchools).where('status', '==', 'active')
		: db.collection(Collections.agoraSchools).where(`supervisorMap.${uid}`, '==', true);
	const snaps = await query.get();

	return snaps.docs
		.map((snap) => snap.data() as AgoraSchool)
		.filter((school) => school.status === 'active')
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** Throw the one refusal every supervisor view shares. */
export function requireScope(scope: SupervisorScope | null): SupervisorScope {
	if (!scope) {
		throw new HttpsError('permission-denied', 'You do not supervise this school');
	}

	return scope;
}
