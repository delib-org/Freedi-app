import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	Collections,
	AgoraTeacherBannedWords,
	SetBannedWordsRequest,
	SetBannedWordsResponse,
	cleanBannedWords,
	functionConfig,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';

/**
 * A teacher replaces their list of words their students may not use.
 *
 * The list is one doc per teacher (`agoraTeacherBannedWords/{uid}`) and the
 * language gate reads it for every text a student of theirs writes. The doc
 * is keyed by the caller's own uid, so nobody can edit another teacher's
 * list; an anonymous account is refused because only teachers sign in.
 */
export const agoraSetBannedWords = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<SetBannedWordsRequest>): Promise<SetBannedWordsResponse> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		if (request.auth?.token.firebase.sign_in_provider === 'anonymous') {
			throw new HttpsError('permission-denied', 'Teachers sign in to keep a word list');
		}
		const words = request.data?.words;
		if (!Array.isArray(words) || words.some((word) => typeof word !== 'string')) {
			throw new HttpsError('invalid-argument', 'words must be a list of strings');
		}

		try {
			const clean = cleanBannedWords(words as string[]);
			const doc: AgoraTeacherBannedWords = {
				teacherId: uid,
				words: clean,
				lastUpdate: Date.now(),
			};
			await db.collection(Collections.agoraTeacherBannedWords).doc(uid).set(doc);

			return { ok: true, words: clean };
		} catch (error) {
			// Never the words themselves: a teacher's list is theirs alone
			logError(error, { operation: 'agora.setBannedWords', userId: uid });
			throw new HttpsError('internal', 'Saving the word list failed');
		}
	},
);
