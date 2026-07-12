import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	Collections,
	AgoraParticipant,
	AgoraSuggestionStatus,
	AGORA_POINTS,
	NotificationTriggerType,
	SourceApp,
	StatementType,
	createAgoraParticipantId,
	functionConfig,
	getRandomUID,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { awardCredit } from '../engagement/credits/creditEngine';
import { CreditAction } from '@freedi/shared-types';

interface Request {
	sessionId: string;
	suggestionId: string;
	resolution: AgoraSuggestionStatus;
}

interface Result {
	ok: boolean;
}

/**
 * The proposal author accepts or thanks an improvement suggestion.
 * Server-side so the suggester's helping points can't be spoofed:
 * validates the caller authored the parent proposal, stamps the status,
 * awards points, and drops an in-app notification for the suggester.
 */
export const agoraResolveSuggestion = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<Request>): Promise<Result> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const { sessionId, suggestionId, resolution } = request.data ?? {};
		if (!sessionId || !suggestionId) {
			throw new HttpsError('invalid-argument', 'sessionId and suggestionId required');
		}
		if (
			resolution !== AgoraSuggestionStatus.accepted &&
			resolution !== AgoraSuggestionStatus.thanked
		) {
			throw new HttpsError('invalid-argument', 'resolution must be accepted or thanked');
		}

		try {
			const suggestionRef = db.collection(Collections.statements).doc(suggestionId);
			const suggestionSnap = await suggestionRef.get();
			if (!suggestionSnap.exists) {
				throw new HttpsError('not-found', 'Suggestion not found');
			}
			const suggestion = suggestionSnap.data() as {
				parentId?: string;
				creatorId?: string;
				agoraSessionId?: string;
				suggestionStatus?: string;
			};
			if (suggestion.agoraSessionId !== sessionId) {
				throw new HttpsError('failed-precondition', 'Suggestion is not part of this session');
			}
			if (suggestion.suggestionStatus && suggestion.suggestionStatus !== AgoraSuggestionStatus.open) {
				return { ok: true }; // already resolved — idempotent
			}

			const proposalSnap = await db
				.collection(Collections.statements)
				.doc(suggestion.parentId ?? '')
				.get();
			if (!proposalSnap.exists || proposalSnap.data()?.creatorId !== uid) {
				throw new HttpsError('permission-denied', 'Only the proposal author can resolve suggestions');
			}

			const suggesterId = suggestion.creatorId;
			const pointsAwarded =
				resolution === AgoraSuggestionStatus.accepted
					? AGORA_POINTS.SUGGESTION_ACCEPTED
					: AGORA_POINTS.SUGGESTION_THANKED;

			await suggestionRef.update({
				suggestionStatus: resolution,
				lastUpdate: Date.now(),
			});

			if (suggesterId && suggesterId !== uid) {
				// Cross-app engagement credits — non-blocking by design
				if (resolution === AgoraSuggestionStatus.accepted) {
					awardCredit({
						userId: suggesterId,
						action: CreditAction.SUGGESTION_ACCEPTED,
						sourceApp: SourceApp.AGORA,
						statementId: suggestionId,
					}).catch((error: unknown) => {
						logError(error, {
							operation: 'agora.resolveSuggestion.awardCredit',
							userId: suggesterId,
						});
					});
				}
				const suggesterRef = db
					.collection(Collections.agoraParticipants)
					.doc(createAgoraParticipantId(sessionId, suggesterId));
				await db.runTransaction(async (transaction) => {
					const snap = await transaction.get(suggesterRef);
					if (!snap.exists) return;
					const participant = snap.data() as AgoraParticipant;
					const points = { ...participant.points };
					points.helping += pointsAwarded;
					points.total += pointsAwarded;
					transaction.update(suggesterRef, { points, lastActive: Date.now() });
				});

				const notificationId = getRandomUID();
				await db.collection(Collections.inAppNotifications).doc(notificationId).set({
					notificationId,
					userId: suggesterId,
					parentId: suggestion.parentId ?? '',
					statementId: suggestionId,
					statementType: StatementType.statement,
					text:
						resolution === AgoraSuggestionStatus.accepted
							? 'Your improvement suggestion was accepted!'
							: 'You received a thank-you for your suggestion!',
					creatorId: uid,
					creatorName: 'Anonymous traveler',
					sourceApp: SourceApp.AGORA,
					triggerType:
						resolution === AgoraSuggestionStatus.accepted
							? NotificationTriggerType.AGORA_SUGGESTION_ACCEPTED
							: NotificationTriggerType.AGORA_SUGGESTION_THANKED,
					targetPath: `/play/${sessionId}`,
					read: false,
					createdAt: Date.now(),
				});
			}

			return { ok: true };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.resolveSuggestion',
				userId: uid,
				metadata: { sessionId, suggestionId, resolution },
			});
			throw new HttpsError('internal', 'Failed to resolve suggestion');
		}
	}
);
