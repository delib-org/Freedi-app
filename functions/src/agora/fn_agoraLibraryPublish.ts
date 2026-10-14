import type { DocumentReference } from 'firebase-admin/firestore';
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../db';
import {
	AGORA_LIBRARY,
	AgoraLibraryCard,
	AgoraLibraryTag,
	AgoraTopicPackage,
	AgoraTopicStatus,
	Collections,
	LibraryPublishRequest,
	LibraryPublishResponse,
	LibraryUnpublishRequest,
	emptyLibraryStats,
	functionConfig,
	publishProblems,
} from '@freedi/shared-types';
import { containsBadLanguage } from '../fn_profanityChecker';
import { logError } from '../utils/errorHandling';
import { authorNameOf, requireApprovedTeacher } from './libraryAccess';
import { isAiCoverUrl } from './libraryCover';
import { isScenarioCoverUrl, tagDelta } from './libraryPublish';
import { currentGlobalMean } from './libraryStats';

const packageRef = (id: string): DocumentReference =>
	db.collection(Collections.agoraTopicPackages).doc(id);
const tagRef = (id: string): DocumentReference =>
	db.collection(Collections.agoraLibraryTags).doc(id);

function asIdList(value: unknown, field: string): string[] {
	if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item)) {
		throw new HttpsError('invalid-argument', `${field} must be a list of ids`);
	}

	return [...new Set(value as string[])];
}

/**
 * Put one of my scenarios in the library (or update how it is listed there).
 *
 * The client checks the same rules first (`publishProblems`) so the button can
 * say what is missing; this is the check that counts. It also writes what a
 * client may not: `visibility`, the `library` card, the `stats` block (rating
 * history survives an unpublish and comes back with the scenario), and the
 * usage counters of the tags. A hidden scenario stays hidden when its owner
 * publishes again — hiding is the admin's, not the owner's, to lift.
 */
export const agoraLibraryPublish = onCall(
	{ region: functionConfig.region, timeoutSeconds: 60 },
	async (request: CallableRequest<LibraryPublishRequest>): Promise<LibraryPublishResponse> => {
		const { uid } = await requireApprovedTeacher(request);
		const data = request.data ?? ({} as LibraryPublishRequest);
		const { scenarioId } = data;
		if (!scenarioId || typeof scenarioId !== 'string') {
			throw new HttpsError('invalid-argument', 'scenarioId is required');
		}
		const summary = typeof data.summary === 'string' ? data.summary.trim() : '';
		const subjectIds = asIdList(data.subjectIds, 'subjectIds');
		const lessonTypeIds = asIdList(data.lessonTypeIds, 'lessonTypeIds');
		const coverUrl = typeof data.coverUrl === 'string' && data.coverUrl ? data.coverUrl : undefined;
		if (coverUrl) {
			if (
				coverUrl.length > AGORA_LIBRARY.MAX_COVER_URL_LENGTH ||
				!isScenarioCoverUrl(coverUrl, scenarioId)
			) {
				throw new HttpsError(
					'invalid-argument',
					'The cover image must be uploaded for this scenario',
				);
			}
		}

		try {
			const pkgSnap = await packageRef(scenarioId).get();
			if (!pkgSnap.exists) throw new HttpsError('not-found', 'Scenario not found');
			const pkg = pkgSnap.data() as AgoraTopicPackage;
			if (pkg.creatorId !== uid) {
				throw new HttpsError('permission-denied', 'Only the scenario owner can publish it');
			}
			if (pkg.kind === 'quick') {
				throw new HttpsError('failed-precondition', 'A quick game is not a scenario');
			}
			const problems = publishProblems({
				summary,
				subjectIds,
				lessonTypeIds,
				ready: pkg.status === AgoraTopicStatus.ready,
				language: pkg.language,
			});
			if (problems.length > 0) {
				throw new HttpsError('failed-precondition', `Cannot publish: ${problems.join(', ')}`);
			}

			// Both lists must name real, live tags of the right kind
			const tagSnaps = await db.getAll(...[...subjectIds, ...lessonTypeIds].map(tagRef));
			const tags = new Map(
				tagSnaps.map((snap) => [snap.id, snap.data() as AgoraLibraryTag | undefined]),
			);
			const wrongKind = (ids: string[], kind: AgoraLibraryTag['kind']): boolean =>
				ids.some((id) => {
					const tag = tags.get(id);

					return !tag || tag.kind !== kind || Boolean(tag.aliasOf);
				});
			if (wrongKind(subjectIds, 'subject') || wrongKind(lessonTypeIds, 'lessonType')) {
				throw new HttpsError('invalid-argument', 'Unknown subject or lesson type');
			}

			// One content check over the words that become public
			if (await containsBadLanguage(`${pkg.title}\n${summary}`)) {
				throw new HttpsError('invalid-argument', 'The title or summary is not allowed');
			}

			const authorName = await authorNameOf(uid);
			const globalMean = await currentGlobalMean();
			const now = Date.now();

			await db.runTransaction(async (transaction) => {
				const fresh = await transaction.get(packageRef(scenarioId));
				const current = fresh.data() as AgoraTopicPackage | undefined;
				if (!current || current.creatorId !== uid) {
					throw new HttpsError('permission-denied', 'Only the scenario owner can publish it');
				}
				const wasPublic = current.visibility === 'public';
				const before = wasPublic
					? [...(current.library?.subjectIds ?? []), ...(current.library?.lessonTypeIds ?? [])]
					: [];
				const delta = tagDelta(before, [...subjectIds, ...lessonTypeIds]);
				const touched = [...delta.add, ...delta.remove];
				const touchedSnaps = await Promise.all(touched.map((id) => transaction.get(tagRef(id))));

				const card: AgoraLibraryCard = {
					summary,
					subjectIds,
					lessonTypeIds,
					...(coverUrl
						? {
								coverUrl,
								coverSource: isAiCoverUrl(coverUrl) ? ('ai' as const) : ('upload' as const),
							}
						: current.library?.coverUrl
							? { coverUrl: current.library.coverUrl, coverSource: current.library.coverSource }
							: {}),
					publishedAt: wasPublic ? (current.library?.publishedAt ?? now) : now,
					authorId: uid,
					authorName,
					hidden: current.library?.hidden ?? false,
					...(current.library?.hiddenReason ? { hiddenReason: current.library.hiddenReason } : {}),
				};
				transaction.update(packageRef(scenarioId), {
					visibility: 'public',
					library: card,
					stats: current.stats ?? emptyLibraryStats(globalMean),
				});
				touchedSnaps.forEach((snap, index) => {
					const tag = snap.data() as AgoraLibraryTag | undefined;
					if (!tag) return;
					const id = touched[index];
					if (delta.add.includes(id)) {
						const teacherIds = tag.teacherIds.includes(uid)
							? tag.teacherIds
							: [...tag.teacherIds, uid].slice(0, AGORA_LIBRARY.TAG_TEACHER_CAP);
						transaction.update(tagRef(id), {
							scenarioCount: FieldValue.increment(1),
							teacherIds,
							lastUpdate: now,
						});
					} else {
						transaction.update(tagRef(id), {
							scenarioCount: FieldValue.increment(-1),
							lastUpdate: now,
						});
					}
				});
			});

			return { scenarioId };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, { operation: 'agora.libraryPublish', userId: uid, metadata: { scenarioId } });
			throw new HttpsError('internal', 'Failed to publish the scenario');
		}
	},
);

/**
 * Back to private: no longer listed, copies already taken are untouched, and
 * the card and the rating history stay on the document so publishing again
 * brings them back.
 */
export const agoraLibraryUnpublish = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<LibraryUnpublishRequest>): Promise<LibraryPublishResponse> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		const scenarioId = request.data?.scenarioId;
		if (!scenarioId || typeof scenarioId !== 'string') {
			throw new HttpsError('invalid-argument', 'scenarioId is required');
		}

		try {
			await db.runTransaction(async (transaction) => {
				const snap = await transaction.get(packageRef(scenarioId));
				const current = snap.data() as AgoraTopicPackage | undefined;
				if (!current) throw new HttpsError('not-found', 'Scenario not found');
				if (current.creatorId !== uid) {
					throw new HttpsError('permission-denied', 'Only the scenario owner can change it');
				}
				if (current.visibility !== 'public') return;
				const tagIds = [
					...(current.library?.subjectIds ?? []),
					...(current.library?.lessonTypeIds ?? []),
				];
				const tagSnaps = await Promise.all(tagIds.map((id) => transaction.get(tagRef(id))));
				transaction.update(packageRef(scenarioId), { visibility: 'private' });
				tagSnaps.forEach((tagSnap, index) => {
					if (!tagSnap.exists) return;
					transaction.update(tagRef(tagIds[index]), {
						scenarioCount: FieldValue.increment(-1),
						lastUpdate: Date.now(),
					});
				});
			});

			return { scenarioId };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.libraryUnpublish',
				userId: uid,
				metadata: { scenarioId },
			});
			throw new HttpsError('internal', 'Failed to unpublish the scenario');
		}
	},
);
