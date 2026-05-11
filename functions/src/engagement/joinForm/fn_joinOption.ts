import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import { db } from '../../db';
import {
	Collections,
	Creator,
	Statement,
	StatementType,
	functionConfig,
} from '@freedi/shared-types';
import { ALLOWED_ORIGINS } from '../../config/cors';

type JoinRole = 'activist' | 'organizer';

interface JoinOptionRequest {
	optionId: string;
	role?: JoinRole;
	/**
	 * When set, the user is leaving `releaseFromOptionId` as part of the same
	 * action. Used by the cap-swap UX (LimitReachedModal). Strip-from-both
	 * means activists or organizers who admin-seeded the released option get
	 * cleared from whichever array they were in.
	 */
	releaseFromOptionId?: string;
}

interface JoinOptionResult {
	success: true;
	action: 'joined' | 'left' | 'swapped';
	role: JoinRole;
	leftStatementId?: string;
	leftStatementTitle?: string;
}

/**
 * Server-enforced "join / leave option" gate. Replaces the client-side
 * transaction in `apps/join/src/lib/store.ts:toggleJoining` for the
 * trust-sensitive part of the flow:
 *
 *   1. Per-user cap (`activationThreshold.maxJoinsPerUser`) — counts the
 *      user's distinct activist memberships across siblings and refuses to
 *      cross the cap. The client-side check stays for UX ("show swap modal
 *      before letting the user click join again"), but the canonical guard
 *      lives here so direct Firestore writes can't bypass it.
 *
 *   2. `singleJoinOnly` enforcement — when a question has the flag set,
 *      joining option B implicitly leaves siblings.
 *
 *   3. Atomic swap — when `releaseFromOptionId` is provided, the leave +
 *      join happen in one transaction.
 *
 * Firestore rules forbid clients from writing to `joined` / `organizers`
 * directly when the question is configured with a `joinForm`, forcing the
 * call to come through this callable. Admin-SDK writes (this function,
 * `resetQuestionJoining`, `resolveJoinIntents`) bypass rules and remain
 * privileged paths.
 *
 * Idempotent: calling join twice in a row is a toggle (second call leaves).
 * The caller can disambiguate by reading the `action` field on the result.
 */
export const fn_joinOption = onCall<JoinOptionRequest, Promise<JoinOptionResult>>(
	{ region: functionConfig.region, cors: [...ALLOWED_ORIGINS] },
	async (request: CallableRequest<JoinOptionRequest>): Promise<JoinOptionResult> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const { optionId, role: roleArg = 'activist', releaseFromOptionId } = request.data ?? {};
		if (!optionId || typeof optionId !== 'string') {
			throw new HttpsError('invalid-argument', 'optionId is required');
		}
		if (roleArg !== 'activist' && roleArg !== 'organizer') {
			throw new HttpsError('invalid-argument', 'role must be activist or organizer');
		}
		const role = roleArg;
		const field: 'joined' | 'organizers' = role === 'organizer' ? 'organizers' : 'joined';
		const otherField: 'joined' | 'organizers' = field === 'joined' ? 'organizers' : 'joined';

		// We need the option's parent question to read settings (cap +
		// singleJoinOnly). Read once outside the transaction; the values are
		// not racy with the membership write — admin changes to those
		// settings while a user is joining are rare and acceptably eventual.
		const optionRef = db.collection(Collections.statements).doc(optionId);
		const optionPreSnap = await optionRef.get();
		if (!optionPreSnap.exists) {
			throw new HttpsError('not-found', 'Option not found');
		}
		const optionPre = optionPreSnap.data() as Statement;
		if (optionPre.statementType !== StatementType.option) {
			throw new HttpsError('failed-precondition', 'Target is not an option');
		}
		const questionId = optionPre.parentId;
		if (!questionId) {
			throw new HttpsError('failed-precondition', 'Option has no parent question');
		}

		const questionSnap = await db.collection(Collections.statements).doc(questionId).get();
		if (!questionSnap.exists) {
			throw new HttpsError('not-found', 'Parent question not found');
		}
		const question = questionSnap.data() as Statement;
		const cap = question.statementSettings?.activationThreshold?.enabled
			? (question.statementSettings.activationThreshold.maxJoinsPerUser ?? 0)
			: 0;
		const singleJoinOnly = question.statementSettings?.singleJoinOnly === true;

		// The creator object we write into the array. Server-trust the auth
		// token's name/email/picture — these aren't user-supplied through
		// the callable payload.
		const tokenName = (request.auth?.token as { name?: string } | undefined)?.name ?? '';
		const tokenEmail = (request.auth?.token as { email?: string } | undefined)?.email ?? null;
		const tokenPicture = (request.auth?.token as { picture?: string } | undefined)?.picture ?? null;
		const creator: Creator = {
			uid,
			displayName: tokenName.trim() || 'Member',
			email: tokenEmail,
			photoURL: tokenPicture,
			isAnonymous: false,
		};

		const releaseRef = releaseFromOptionId
			? db.collection(Collections.statements).doc(releaseFromOptionId)
			: null;

		let action: JoinOptionResult['action'] = 'joined';
		let leftStatementId: string | undefined;
		let leftStatementTitle: string | undefined;

		await db.runTransaction(async (tx) => {
			const optSnap = await tx.get(optionRef);
			if (!optSnap.exists) throw new HttpsError('not-found', 'Option not found');
			const releaseSnap = releaseRef ? await tx.get(releaseRef) : null;

			const opt = optSnap.data() as Statement;
			const currentMembers: Creator[] = (field === 'organizers' ? opt.organizers : opt.joined) ?? [];
			const currentOthers: Creator[] = (otherField === 'organizers' ? opt.organizers : opt.joined) ?? [];
			const isMember = currentMembers.some((u) => u.uid === uid);

			// LEAVE — toggling off. Cap doesn't apply to leaves.
			if (isMember) {
				const updated = currentMembers.filter((u) => u.uid !== uid);
				tx.update(optionRef, { [field]: updated });
				action = 'left';

				return;
			}

			// JOIN — apply server-enforced cap before the write. The cap
			// counts the user's CURRENT distinct activist memberships across
			// siblings (organizers never count toward the cap by design —
			// they're firm commitments). We only need the count if `cap > 0`.
			if (cap > 0 && role === 'activist') {
				// Read all sibling options under the parent question. This
				// can't be done inside the transaction's read phase
				// efficiently (Firestore tx reads don't support queries), so
				// we read it via the regular client outside the tx atomicity
				// window. The cap is effectively eventually consistent — a
				// burst of two simultaneous joins can each succeed even when
				// the second would push past the cap. Acceptable: cap is a
				// participation guideline, not a security boundary.
				const siblingsSnap = await db
					.collection(Collections.statements)
					.where('parentId', '==', questionId)
					.where('statementType', '==', StatementType.option)
					.get();

				let currentCount = 0;
				let alreadyOnThis = false;
				for (const s of siblingsSnap.docs) {
					if (s.id === optionId) {
						alreadyOnThis = true;
						continue;
					}
					if (releaseFromOptionId && s.id === releaseFromOptionId) continue;
					const sd = s.data() as Statement;
					const integratedInto = (sd as { integratedInto?: string }).integratedInto;
					if (sd.isCluster === true || integratedInto) continue;
					if ((sd.joined ?? []).some((c: Creator) => c?.uid === uid)) {
						currentCount++;
					}
				}
				if (!alreadyOnThis && currentCount >= cap) {
					throw new HttpsError(
						'failed-precondition',
						`This question caps participation at ${cap} groups. Leave one before joining another.`,
					);
				}
			}

			const updatePayload: Record<string, Creator[]> = {};
			const isUserInOther = currentOthers.some((u) => u.uid === uid);
			if (isUserInOther) {
				updatePayload[otherField] = currentOthers.filter((u) => u.uid !== uid);
			}

			// Explicit swap (LimitReachedModal): leave the released option
			// (any role) and join the new one in the same transaction.
			if (
				releaseSnap &&
				releaseSnap.exists &&
				releaseRef &&
				releaseRef.path !== optionRef.path
			) {
				const releaseData = releaseSnap.data() as Statement;
				const releaseJoined: Creator[] = Array.isArray(releaseData.joined) ? releaseData.joined : [];
				const releaseOrgs: Creator[] = Array.isArray(releaseData.organizers) ? releaseData.organizers : [];
				const releaseUpdate: Record<string, Creator[]> = {};
				if (releaseJoined.some((u) => u.uid === uid)) {
					releaseUpdate.joined = releaseJoined.filter((u) => u.uid !== uid);
				}
				if (releaseOrgs.some((u) => u.uid === uid)) {
					releaseUpdate.organizers = releaseOrgs.filter((u) => u.uid !== uid);
				}
				if (Object.keys(releaseUpdate).length > 0) {
					tx.update(releaseRef, releaseUpdate);
				}
				leftStatementId = releaseData.statementId;
				leftStatementTitle = releaseData.statement;
				action = 'swapped';
			} else if (role === 'activist' && singleJoinOnly) {
				// SingleJoinOnly: implicit removal from any sibling the user
				// is also activist on. Read siblings outside tx (queries
				// don't work in transactions); apply removals via tx.update.
				const siblingsSnap = await db
					.collection(Collections.statements)
					.where('parentId', '==', questionId)
					.where('statementType', '==', StatementType.option)
					.get();
				for (const s of siblingsSnap.docs) {
					if (s.id === optionId) continue;
					const sd = s.data() as Statement;
					if ((sd.joined ?? []).some((c: Creator) => c?.uid === uid)) {
						const sibRef = db.collection(Collections.statements).doc(s.id);
						const updated = (sd.joined ?? []).filter((c: Creator) => c?.uid !== uid);
						tx.update(sibRef, { joined: updated });
						leftStatementId = sd.statementId;
						leftStatementTitle = sd.statement;
						action = 'swapped';
					}
				}
			}

			updatePayload[field] = [...currentMembers, creator];
			tx.update(optionRef, updatePayload);
		});

		logger.info('[fn_joinOption] Done', {
			operation: 'joinForm.joinOption',
			userId: uid,
			questionId,
			optionId,
			role,
			action,
			cap,
		});

		return {
			success: true,
			action,
			role,
			leftStatementId,
			leftStatementTitle,
		};
	},
);
