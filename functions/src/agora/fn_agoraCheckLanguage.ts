import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	Collections,
	AgoraParticipant,
	AgoraSession,
	AGORA_LIMITS,
	CheckLanguageRequest,
	CheckLanguageResponse,
	AgoraLanguagePlace,
	applyLanguageStrike,
	isAgoraLanguagePlace,
	createAgoraParticipantId,
	functionConfig,
	findBannedWord,
	isAgoraAiUid,
} from '@freedi/shared-types';
import { containsBadLanguage } from '../fn_profanityChecker';
import { logError } from '../utils/errorHandling';
import { fileThreadLine } from './teacherThread';
import { loadTeacherBannedWords } from './teacherBannedWords';

/** What the gate needs to know about the caller and the words */
export interface LanguageCheckInput {
	uid: string;
	sessionId: string;
	text: string;
	statementId?: string;
	/** Where the student was writing — for the teacher's alert */
	place?: AgoraLanguagePlace;
	/** The stage-plan item the text belonged to */
	itemId?: string;
}

/** The detector, injectable so the ledger can be tested without a model */
export type LanguageDetector = (text: string) => Promise<boolean>;

/**
 * The gate every student text passes before the client writes it: a note
 * (proposal), a question-stage answer, a thread message or an improvement
 * idea. The client asks here first and only writes on `ok: true`, so a slur
 * never reaches the world-readable `statements` collection at all — not
 * even for the second it would take a trigger to hide it.
 *
 * A refusal is charged and filed HERE, in the same call, because this is the
 * only moment the server sees the words: the client never writes them
 * anywhere. Three things happen, in this order so a crash leaves the ledger
 * ahead of the notice rather than behind it:
 *
 *   1. the participant doc takes the strike (count + clock) and loses
 *      AGORA_POINTS.LANGUAGE_PENALTY coins, floored at 0 — a transaction,
 *      because the points field is also written by the scoring triggers;
 *   2. the words and the fact are filed on the private teacher ↔ student
 *      thread as a `system` line of kind `language` — the one place both
 *      readers already look, and the only copy of the text that exists;
 *   3. the response tells the client to keep the draft and say why.
 *
 * The detector fails OPEN (see `containsBadLanguage`): an outage must never
 * accuse a child. The same reasoning puts the gate on the client's path and
 * not in a Firestore rule — a rule cannot call a model, and a trigger that
 * hid text after the fact would still have shown it to the room first.
 *
 * Known limit: a student who bypasses the app and writes to Firestore
 * directly skips the gate. The teacher's take-down (`agoraModerateStatement`)
 * remains the backstop for that case.
 */
export async function checkLanguageFor(
	input: LanguageCheckInput,
	detect: LanguageDetector = containsBadLanguage,
	now: () => number = Date.now,
): Promise<CheckLanguageResponse> {
	const { uid, sessionId, statementId, place, itemId } = input;
	const text = input.text.trim().slice(0, AGORA_LIMITS.MAX_PROPOSAL_LENGTH);
	if (!text) return { ok: true };

	const participantRef = db
		.collection(Collections.agoraParticipants)
		.doc(createAgoraParticipantId(sessionId, uid));
	const [participantSnap, sessionSnap] = await Promise.all([
		participantRef.get(),
		db.collection(Collections.agoraSessions).doc(sessionId).get(),
	]);
	const participant = participantSnap.data() as AgoraParticipant | undefined;
	const session = sessionSnap.data() as AgoraSession | undefined;
	if (!session) {
		throw new HttpsError('not-found', 'Session not found');
	}
	if (!participant || participant.isAI || isAgoraAiUid(uid)) {
		throw new HttpsError('permission-denied', 'not-a-participant');
	}

	// The teacher's own list comes first: instant, free, and a rephrase request,
	// not an accusation — so no strike, no coins and nothing on the teacher's
	// thread. The list never leaves the server; the student gets their own word.
	const banned = await loadTeacherBannedWords(session.teacherId);
	const bannedWord = findBannedWord(text, banned);
	if (bannedWord) return { ok: false, reason: 'banned_word', word: bannedWord };

	const flagged = await detect(text);
	if (!flagged) return { ok: true };

	const stamp = now();
	const outcome = await db.runTransaction(async (transaction) => {
		const fresh = await transaction.get(participantRef);
		const current = (fresh.data() as AgoraParticipant | undefined) ?? participant;
		const strike = applyLanguageStrike(current, stamp);
		transaction.update(participantRef, {
			points: strike.points,
			languageStrikes: strike.languageStrikes,
			lastLanguageStrikeAt: strike.lastLanguageStrikeAt,
			lastActive: stamp,
		});

		return strike;
	});

	await fileThreadLine({
		sessionId,
		teacherId: session.teacherId,
		studentUid: uid,
		from: 'system',
		kind: 'language',
		text: '',
		...(statementId ? { aboutStatementId: statementId } : {}),
		...(place ? { languagePlace: place } : {}),
		...(itemId ? { languageItemId: itemId } : {}),
		removedText: text,
	});

	return {
		ok: false,
		reason: 'language',
		strikes: outcome.languageStrikes,
		deducted: outcome.deducted,
		pointsTotal: outcome.points.total,
	};
}

export const agoraCheckLanguage = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<CheckLanguageRequest>): Promise<CheckLanguageResponse> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		const { sessionId, text, statementId, place, itemId } =
			request.data ?? ({} as CheckLanguageRequest);
		if (!sessionId || typeof sessionId !== 'string') {
			throw new HttpsError('invalid-argument', 'sessionId is required');
		}
		if (typeof text !== 'string') {
			throw new HttpsError('invalid-argument', 'text is required');
		}
		if (statementId !== undefined && typeof statementId !== 'string') {
			throw new HttpsError('invalid-argument', 'statementId must be a string');
		}

		// Context for the teacher's alert, never a reason to refuse: an unknown
		// place (a newer client) is dropped, not rejected
		const safePlace = isAgoraLanguagePlace(place) ? place : undefined;
		const safeItemId =
			typeof itemId === 'string' && itemId.length > 0 && itemId.length <= 200 ? itemId : undefined;

		try {
			return await checkLanguageFor({
				uid,
				sessionId,
				text,
				statementId,
				place: safePlace,
				itemId: safeItemId,
			});
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			// Never the text: it is a child's words, and this is Cloud Logging.
			logError(error, {
				operation: 'agora.checkLanguage',
				userId: uid,
				metadata: { sessionId, statementId },
			});
			throw new HttpsError('internal', 'Language check failed');
		}
	},
);
