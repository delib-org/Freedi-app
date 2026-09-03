import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	Collections,
	AgoraClass,
	AgoraClassAggregate,
	AgoraClassMember,
	AgoraParticipant,
	AgoraSchool,
	AgoraSession,
	AgoraStudentAggregate,
	functionConfig,
	TeacherConsoleMember,
	TeacherConsoleRequest,
	TeacherConsoleResponse,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';

/**
 * Every read the teacher console makes, served server-side.
 *
 * Client-side list queries scoped by document data ("my classes", "this
 * class's roster") are exactly what Firestore rules cannot reliably prove for
 * the SDK's listen path — and the roster (with its PIN hashes) should never
 * be client-listable anyway. So the console asks HERE, the Admin SDK reads
 * with real authority, and the response carries only what the teacher may
 * see: roster rows without rejoinPinHash/uidHistory, participants without
 * the AI raters.
 */

/** The roster as the teacher sees it — never the PIN hash or uid history. */
function toTeacherMember(member: AgoraClassMember): TeacherConsoleMember {
	return {
		memberId: member.memberId,
		alias: member.alias,
		joinedAt: member.joinedAt,
		lastActive: member.lastActive,
	};
}

async function loadTeacherClass(classId: string, uid: string): Promise<AgoraClass> {
	const snap = await db.collection(Collections.agoraClasses).doc(classId).get();
	const agoraClass = snap.data() as AgoraClass | undefined;
	if (!agoraClass) {
		throw new HttpsError('not-found', 'Class not found');
	}
	if (!agoraClass.teacherIds.includes(uid)) {
		throw new HttpsError('permission-denied', 'Only a teacher of this class may view it');
	}

	return agoraClass;
}

export const agoraTeacherConsole = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<TeacherConsoleRequest>): Promise<TeacherConsoleResponse> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		if (request.auth?.token.firebase.sign_in_provider === 'anonymous') {
			throw new HttpsError('permission-denied', 'Teachers must sign in with a full account');
		}

		const data = request.data ?? ({} as TeacherConsoleRequest);

		try {
			switch (data.view) {
				case 'dashboard': {
					const [classSnaps, sessionSnaps] = await Promise.all([
						db
							.collection(Collections.agoraClasses)
							.where('teacherIds', 'array-contains', uid)
							.get(),
						db
							.collection(Collections.agoraSessions)
							.where('teacherId', '==', uid)
							.orderBy('createdAt', 'desc')
							.limit(20)
							.get(),
					]);
					const classes = classSnaps.docs
						.map((snap) => snap.data() as AgoraClass)
						.filter((agoraClass) => agoraClass.status === 'active')
						.sort((a, b) => a.name.localeCompare(b.name));
					const aggregateSnaps = await Promise.all(
						classes.map((agoraClass) =>
							db.collection(Collections.agoraClassAggregates).doc(agoraClass.classId).get(),
						),
					);
					const aggregates: Record<string, AgoraClassAggregate> = {};
					for (const snap of aggregateSnaps) {
						const aggregate = snap.data() as AgoraClassAggregate | undefined;
						if (aggregate) aggregates[aggregate.classId] = aggregate;
					}

					return {
						classes: classes.map((agoraClass) => ({
							classId: agoraClass.classId,
							name: agoraClass.name,
							...(agoraClass.gradeLevel ? { gradeLevel: agoraClass.gradeLevel } : {}),
							classCode: agoraClass.classCode,
							memberCount: agoraClass.memberCount,
							schoolId: agoraClass.schoolId,
						})),
						aggregates,
						sessions: sessionSnaps.docs.map((snap) => snap.data() as AgoraSession),
					};
				}

				case 'class': {
					if (!data.classId || typeof data.classId !== 'string') {
						throw new HttpsError('invalid-argument', 'classId is required');
					}
					const agoraClass = await loadTeacherClass(data.classId, uid);
					const [schoolSnap, memberSnaps, careerSnaps, aggregateSnap, sessionSnaps] =
						await Promise.all([
							db.collection(Collections.agoraSchools).doc(agoraClass.schoolId).get(),
							db
								.collection(Collections.agoraClassMembers)
								.where('classId', '==', data.classId)
								.where('status', '==', 'active')
								.get(),
							db
								.collection(Collections.agoraStudentAggregates)
								.where('classId', '==', data.classId)
								.get(),
							db.collection(Collections.agoraClassAggregates).doc(data.classId).get(),
							db
								.collection(Collections.agoraSessions)
								.where('classId', '==', data.classId)
								.orderBy('createdAt', 'desc')
								.limit(50)
								.get(),
						]);
					const careers: Record<string, AgoraStudentAggregate> = {};
					for (const snap of careerSnaps.docs) {
						const career = snap.data() as AgoraStudentAggregate;
						careers[career.memberId] = career;
					}

					return {
						classId: agoraClass.classId,
						name: agoraClass.name,
						...(agoraClass.gradeLevel ? { gradeLevel: agoraClass.gradeLevel } : {}),
						classCode: agoraClass.classCode,
						schoolName: (schoolSnap.data() as AgoraSchool | undefined)?.name ?? '',
						members: memberSnaps.docs
							.map((snap) => toTeacherMember(snap.data() as AgoraClassMember))
							.sort((a, b) => a.alias.localeCompare(b.alias)),
						careers,
						aggregate: (aggregateSnap.data() as AgoraClassAggregate | undefined) ?? null,
						sessions: sessionSnaps.docs.map((snap) => snap.data() as AgoraSession),
					};
				}

				case 'report': {
					if (!data.sessionId || typeof data.sessionId !== 'string') {
						throw new HttpsError('invalid-argument', 'sessionId is required');
					}
					const sessionSnap = await db
						.collection(Collections.agoraSessions)
						.doc(data.sessionId)
						.get();
					const session = sessionSnap.data() as AgoraSession | undefined;
					if (!session) {
						throw new HttpsError('not-found', 'Session not found');
					}
					if (session.teacherId !== uid) {
						throw new HttpsError('permission-denied', 'Only the session teacher may view this');
					}
					const [participantSnaps, identitySnaps] = await Promise.all([
						db
							.collection(Collections.agoraParticipants)
							.where('sessionId', '==', data.sessionId)
							.get(),
						// The real names, for the report the teacher keeps — this caller is
						// the session teacher (checked above), the one reader they exist for
						db
							.collection(Collections.agoraIdentities)
							.where('sessionId', '==', data.sessionId)
							.get(),
					]);
					const participants = participantSnaps.docs
						.map((snap) => snap.data() as AgoraParticipant)
						.filter((participant) => !participant.isAI)
						.sort((a, b) => b.points.total - a.points.total);

					return {
						session,
						participants,
						identities: identitySnaps.docs.map((snap) => snap.data()),
					};
				}

				default:
					throw new HttpsError('invalid-argument', 'Unknown view');
			}
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.teacherConsole',
				userId: uid,
				metadata: { view: data.view },
			});
			throw new HttpsError('internal', 'Failed to load console data');
		}
	},
);
