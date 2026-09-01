import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../db';
import {
	Collections,
	functionConfig,
	getRandomUID,
	AgoraClass,
	AgoraClassMember,
	AGORA_CLASSROOM,
	createAgoraClassMemberId,
	JoinClassRequest,
	JoinClassResponse,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { generatePin, hashPin, verifyPin } from './rosterPins';

/**
 * The student side of the class roster. Anonymous auth is the point — this is
 * how an anon uid becomes (claim), lists (listAliases), or re-becomes
 * (reclaim, after a device switch) a class member.
 *
 * Students have NO Firestore read access to `agoraClassMembers` (a roster is
 * not for classmates to enumerate) — everything the join screen needs comes
 * back from here, and the alias picker rows carry nothing but alias+memberId.
 */
export const agoraJoinClass = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<JoinClassRequest>): Promise<JoinClassResponse> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const { classCode, mode, alias, memberId, pin } = request.data ?? {};
		const normalisedCode = (classCode ?? '').replace(/\D/g, '');
		if (normalisedCode.length !== AGORA_CLASSROOM.CLASS_CODE_LENGTH) {
			throw new HttpsError('invalid-argument', 'classCode must be 6 digits');
		}

		try {
			const classSnap = await db
				.collection(Collections.agoraClasses)
				.where('classCode', '==', normalisedCode)
				.limit(1)
				.get();
			if (classSnap.empty) {
				throw new HttpsError('not-found', 'Class not found');
			}
			const agoraClass = classSnap.docs[0].data() as AgoraClass;
			if (agoraClass.status !== 'active') {
				throw new HttpsError('failed-precondition', 'This class is archived');
			}
			const { classId, schoolId, name: className } = agoraClass;
			const membersRef = db.collection(Collections.agoraClassMembers);

			if (mode === 'listAliases') {
				const members = await membersRef
					.where('classId', '==', classId)
					.where('status', '==', 'active')
					.get();
				const aliases = members.docs
					.map((doc) => {
						const member = doc.data() as AgoraClassMember;

						return { memberId: member.memberId, alias: member.alias };
					})
					.sort((a, b) => a.alias.localeCompare(b.alias));

				return { classId, className, aliases };
			}

			if (mode === 'claim') {
				const trimmedAlias = alias?.trim() ?? '';
				if (
					trimmedAlias.length < AGORA_CLASSROOM.MIN_ALIAS_LENGTH ||
					trimmedAlias.length > AGORA_CLASSROOM.MAX_ALIAS_LENGTH
				) {
					throw new HttpsError('invalid-argument', 'Nickname length out of range');
				}

				// If this uid already holds a spot in the class (double-tap, retried
				// callable, or a student re-running the claim screen), hand back the
				// existing spot instead of minting a second one. No PIN — it was
				// shown once at the original claim.
				const mine = await membersRef
					.where('classId', '==', classId)
					.where('currentUid', '==', uid)
					.where('status', '==', 'active')
					.limit(1)
					.get();
				if (!mine.empty) {
					const member = mine.docs[0].data() as AgoraClassMember;

					return { classId, className, memberId: member.memberId, alias: member.alias };
				}

				const newMemberId = getRandomUID();
				const rawPin = generatePin();
				const now = Date.now();

				// The alias-uniqueness check runs INSIDE the transaction so two
				// students claiming the same nickname at once serialise — the loser
				// gets the "taken" error instead of a duplicate roster row.
				await db.runTransaction(async (transaction) => {
					const taken = await transaction.get(
						membersRef
							.where('classId', '==', classId)
							.where('alias', '==', trimmedAlias)
							.where('status', '==', 'active')
							.limit(1),
					);
					if (!taken.empty) {
						throw new HttpsError('already-exists', 'That nickname is taken in this class');
					}

					const member: AgoraClassMember = {
						memberId: newMemberId,
						classId,
						schoolId,
						alias: trimmedAlias,
						currentUid: uid,
						rejoinPinHash: hashPin(rawPin),
						status: 'active',
						joinedAt: now,
						lastActive: now,
						lastUpdate: now,
					};
					transaction.set(
						membersRef.doc(createAgoraClassMemberId(classId, newMemberId)),
						member,
					);
					transaction.update(db.collection(Collections.agoraClasses).doc(classId), {
						memberCount: FieldValue.increment(1),
						lastUpdate: now,
					});
				});

				return { classId, className, memberId: newMemberId, alias: trimmedAlias, pin: rawPin };
			}

			if (mode === 'reclaim') {
				if (!memberId || typeof memberId !== 'string') {
					throw new HttpsError('invalid-argument', 'memberId is required');
				}
				if (!pin || typeof pin !== 'string') {
					throw new HttpsError('invalid-argument', 'pin is required');
				}

				const memberRef = membersRef.doc(createAgoraClassMemberId(classId, memberId));
				const now = Date.now();

				// Verify and count attempts in one transaction: concurrent guesses
				// serialise against the counter, so the lockout cannot be raced past.
				const result = await db.runTransaction(async (transaction) => {
					const snap = await transaction.get(memberRef);
					const member = snap.data() as AgoraClassMember | undefined;
					if (!member || member.status !== 'active') {
						throw new HttpsError('not-found', 'Roster spot not found');
					}
					if ((member.pinAttempts ?? 0) >= AGORA_CLASSROOM.MAX_PIN_ATTEMPTS) {
						throw new HttpsError(
							'resource-exhausted',
							'Too many wrong PINs — ask your teacher to reset it',
						);
					}
					if (!verifyPin(pin, member.rejoinPinHash)) {
						transaction.update(memberRef, {
							pinAttempts: FieldValue.increment(1),
							lastUpdate: now,
						});

						return null;
					}

					// Same device coming back is not a switch — don't grow the history.
					const uidHistory =
						member.currentUid === uid
							? member.uidHistory
							: [...(member.uidHistory ?? []), member.currentUid].slice(
									-AGORA_CLASSROOM.UID_HISTORY_CAP,
								);
					transaction.update(memberRef, {
						currentUid: uid,
						...(uidHistory ? { uidHistory } : {}),
						pinAttempts: 0,
						lastActive: now,
						lastUpdate: now,
					});

					return { memberId: member.memberId, alias: member.alias };
				});

				if (!result) {
					throw new HttpsError('permission-denied', 'Wrong PIN');
				}

				return { classId, className, memberId: result.memberId, alias: result.alias };
			}

			throw new HttpsError('invalid-argument', 'Unknown mode');
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.joinClass',
				userId: uid,
				metadata: { mode },
			});
			throw new HttpsError('internal', 'Failed to join class');
		}
	},
);
