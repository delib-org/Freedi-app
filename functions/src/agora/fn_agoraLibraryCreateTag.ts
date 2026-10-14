import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	AGORA_LIBRARY,
	AgoraApprovedTeacher,
	AgoraLibraryTag,
	Collections,
	LibraryCreateTagRequest,
	LibraryCreateTagResponse,
	agoraTagId,
	functionConfig,
	isAgoraLibraryLang,
	normalizeTagKey,
} from '@freedi/shared-types';
import { containsBadLanguage } from '../fn_profanityChecker';
import { logError } from '../utils/errorHandling';
import { countTag, markerRef, requireApprovedTeacher } from './libraryAccess';
import { translateLabel } from './libraryTranslate';

/**
 * A teacher adds a subject or lesson type of their own. It is usable on a
 * scenario at once (status `pending`: it gets its own filter chip once enough
 * teachers adopt it), and it is stored with its label in every language so a
 * reader anywhere sees it in theirs.
 *
 * The id is a hash of (kind, normalized key), so the same words — niqqud,
 * quotes, spacing aside — can never become two tags; the second asker is
 * handed the first one. The client has already shown near matches; this is
 * the server's side of the same promise. At most
 * `AGORA_LIBRARY.TAGS_PER_WEEK` new tags per teacher per week.
 */
export const agoraLibraryCreateTag = onCall(
	{ region: functionConfig.region, timeoutSeconds: 60 },
	async (request: CallableRequest<LibraryCreateTagRequest>): Promise<LibraryCreateTagResponse> => {
		const { uid } = await requireApprovedTeacher(request);
		const { kind, label, lang } = request.data ?? ({} as LibraryCreateTagRequest);
		if (kind !== 'subject' && kind !== 'lessonType') {
			throw new HttpsError('invalid-argument', 'kind must be subject or lessonType');
		}
		if (typeof label !== 'string' || typeof lang !== 'string' || !isAgoraLibraryLang(lang)) {
			throw new HttpsError('invalid-argument', 'label and a library language are required');
		}
		const cleanLabel = label.trim().replace(/\s+/g, ' ');
		if (
			cleanLabel.length < AGORA_LIBRARY.TAG_LABEL_MIN ||
			cleanLabel.length > AGORA_LIBRARY.TAG_LABEL_MAX
		) {
			throw new HttpsError(
				'invalid-argument',
				`label must be ${AGORA_LIBRARY.TAG_LABEL_MIN}-${AGORA_LIBRARY.TAG_LABEL_MAX} characters`,
			);
		}
		const normalizedKey = normalizeTagKey(cleanLabel);
		if (!normalizedKey) {
			throw new HttpsError('invalid-argument', 'label has no words in it');
		}
		const tagId = agoraTagId(kind, normalizedKey);
		const tagRef = db.collection(Collections.agoraLibraryTags).doc(tagId);

		try {
			if ((await tagRef.get()).exists) return { tagId, existed: true };
			if (await containsBadLanguage(cleanLabel)) {
				throw new HttpsError('invalid-argument', 'That name is not allowed');
			}
			// The slow part (the translator) happens before the transaction
			const labels = await translateLabel(cleanLabel, lang);
			const now = Date.now();

			const existed = await db.runTransaction(async (transaction) => {
				const [tagSnap, markerSnap] = await Promise.all([
					transaction.get(tagRef),
					transaction.get(markerRef(uid)),
				]);
				if (tagSnap.exists) return true;
				const counted = countTag(
					markerSnap.data() as Partial<AgoraApprovedTeacher> | undefined,
					now,
				);
				if (!counted) {
					throw new HttpsError(
						'resource-exhausted',
						`You can add ${AGORA_LIBRARY.TAGS_PER_WEEK} new tags a week`,
					);
				}
				const tag: AgoraLibraryTag = {
					tagId,
					kind,
					label: cleanLabel,
					labelLang: lang,
					labels,
					normalizedKey,
					status: 'pending',
					scenarioCount: 0,
					teacherIds: [],
					createdBy: uid,
					createdAt: now,
					lastUpdate: now,
				};
				transaction.set(tagRef, tag);
				transaction.set(markerRef(uid), counted, { merge: true });

				return false;
			});

			return { tagId, existed };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, { operation: 'agora.libraryCreateTag', userId: uid, metadata: { kind } });
			throw new HttpsError('internal', 'Failed to add the tag');
		}
	},
);
