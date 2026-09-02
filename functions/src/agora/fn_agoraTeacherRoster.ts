import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../db';
import {
	Collections,
	functionConfig,
	AgoraClass,
	AgoraClassMember,
	AGORA_CLASSROOM,
	createAgoraClassMemberId,
	TeacherRosterRequest,
	TeacherRosterResponse,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { generatePin, hashPin } from './rosterPins';

/**
 * Teacher roster actions on their own class: rename a student's alias, remove
 * a member, or reset a lost device binding (fresh PIN, handed to the student
 * on paper). Gated on membership of the class's teacherIds — rules deny all
 * client writes to `agoraClassMembers`.
 */
export const agoraTeacherRoster = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<TeacherRosterRequest>): Promise<TeacherRosterResponse> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const { classId, action, memberId, alias } = request.data ?? {};
		if (!classId || typeof classId !== 'string') {
			throw new HttpsError('invalid-argument', 'classId is required');
		}
		if (!memberId || typeof memberId !== 'string') {
			throw new HttpsError('invalid-argument', 'memberId is required');
		}

		try {
			const classSnap = await db.collection(Collections.agoraClasses).doc(classId).get();
			const agoraClass = classSnap.data() as AgoraClass | undefined;
			if (!agoraClass) {
				throw new HttpsError('not-found', 'Class not found');
			}
			if (!agoraClass.teacherIds.includes(uid)) {
				throw new HttpsError('permission-denied', 'Only a teacher of this class may manage it');
			}

			const memberRef = db
				.collection(Collections.agoraClassMembers)
				.doc(createAgoraClassMemberId(classId, memberId));
			const memberSnap = await memberRef.get();
			const member = memberSnap.data() as AgoraClassMember | undefined;
			if (!member) {
				throw new HttpsError('not-found', 'Roster spot not found');
			}

			const now = Date.now();

			switch (action) {
				case 'renameAlias': {
					const trimmed = alias?.trim() ?? '';
					if (
						trimmed.length < AGORA_CLASSROOM.MIN_ALIAS_LENGTH ||
						trimmed.length > AGORA_CLASSROOM.MAX_ALIAS_LENGTH
					) {
						throw new HttpsError('invalid-argument', 'Nickname length out of range');
					}
					const taken = await db
						.collection(Collections.agoraClassMembers)
						.where('classId', '==', classId)
						.where('alias', '==', trimmed)
						.where('status', '==', 'active')
						.limit(1)
						.get();
					if (!taken.empty && taken.docs[0].id !== memberRef.id) {
						throw new HttpsError('already-exists', 'That nickname is taken in this class');
					}
					await memberRef.update({ alias: trimmed, lastUpdate: now });

					return { memberId };
				}
				case 'removeMember': {
					if (member.status === 'removed') return { memberId };
					const batch = db.batch();
					batch.update(memberRef, { status: 'removed', lastUpdate: now });
					batch.update(db.collection(Collections.agoraClasses).doc(classId), {
						memberCount: FieldValue.increment(-1),
						lastUpdate: now,
					});
					await batch.commit();

					return { memberId };
				}
				case 'resetBinding': {
					// A fresh PIN and no bound device: the student's next join runs the
					// reclaim path on whatever device they hold, with the PIN the
					// teacher just handed them.
					const rawPin = generatePin();
					await memberRef.update({
						currentUid: '',
						rejoinPinHash: hashPin(rawPin),
						pinAttempts: 0,
						lastUpdate: now,
					});

					return { memberId, pin: rawPin };
				}
				default:
					throw new HttpsError('invalid-argument', 'Unknown action');
			}
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.teacherRoster',
				userId: uid,
				metadata: { classId, action, memberId },
			});
			throw new HttpsError('internal', 'Failed to update roster');
		}
	},
);
