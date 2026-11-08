import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../db';
import {
	AgoraApprovedTeacher,
	AgoraTopicPackage,
	AgoraTopicPackageSchema,
	Collections,
	LibraryUseRequest,
	LibraryUseResponse,
	LibraryTranslateRequest,
	LibraryTranslateResponse,
	AgoraScenarioCardText,
	functionConfig,
	getRandomUID,
	isAgoraLibraryLang,
} from '@freedi/shared-types';
import { parse } from 'valibot';
import { logError } from '../utils/errorHandling';
import { countCopy, markerRef, requireApprovedTeacher } from './libraryAccess';
import { translatedCard, translatedPackage } from './libraryTranslation';

const TRANSLATE_MAX_IDS = 30;

/** A scenario a teacher may take from the library: public and not hidden */
function isListed(pkg: AgoraTopicPackage | undefined): boolean {
	return Boolean(pkg && pkg.visibility === 'public' && pkg.library && !pkg.library.hidden);
}

/** A copy starts life as an ordinary private package: no listing, no stats, no credit yet */
function withoutLibraryFields(pkg: AgoraTopicPackage): AgoraTopicPackage {
	const body = { ...pkg };
	delete body.library;
	delete body.stats;
	delete body.visibility;
	delete body.sourceScenarioId;
	delete body.sourceTitle;
	delete body.sourceAuthorName;
	delete body.sourceVersion;

	return body;
}

/**
 * "Use this scenario": the caller gets a COPY of their own, private, ready to
 * start or to adapt. The copy stays linked to the original — `sourceScenarioId`
 * plus the original author's name and title as they were — and remembers the
 * original's `lastUpdate` so the shelf can say "a new version is available".
 *
 * When the scenario is written in another language than the teacher's, the
 * copy is translated into theirs (cached per scenario per language, so a
 * second teacher taking it in the same language pays nothing).
 */
export const agoraLibraryUse = onCall(
	{ region: functionConfig.region, timeoutSeconds: 300, memory: '512MiB' },
	async (request: CallableRequest<LibraryUseRequest>): Promise<LibraryUseResponse> => {
		const { uid } = await requireApprovedTeacher(request);
		const { scenarioId, lang } = request.data ?? ({} as LibraryUseRequest);
		if (!scenarioId || typeof scenarioId !== 'string') {
			throw new HttpsError('invalid-argument', 'scenarioId is required');
		}
		if (typeof lang !== 'string' || !isAgoraLibraryLang(lang)) {
			throw new HttpsError('invalid-argument', 'lang must be a library language');
		}

		try {
			const originalRef = db.collection(Collections.agoraTopicPackages).doc(scenarioId);
			const original = (await originalRef.get()).data() as AgoraTopicPackage | undefined;
			if (!original || !isListed(original)) {
				throw new HttpsError('not-found', 'Scenario not found');
			}

			const translated = original.language !== lang;
			const source = translated ? await translatedPackage(original, lang) : original;

			const copyId = getRandomUID();
			const now = Date.now();
			const body = withoutLibraryFields(source);
			const copy: AgoraTopicPackage = parse(AgoraTopicPackageSchema, {
				...body,
				topicPackageId: copyId,
				creatorId: uid,
				kind: 'scenario',
				sourceScenarioId: scenarioId,
				sourceTitle: original.title,
				sourceAuthorName: original.library?.authorName ?? '',
				sourceVersion: original.lastUpdate,
				createdAt: now,
				lastUpdate: now,
			});

			await db.runTransaction(async (transaction) => {
				const [markerSnap, originalSnap] = await Promise.all([
					transaction.get(markerRef(uid)),
					transaction.get(originalRef),
				]);
				if (!isListed(originalSnap.data() as AgoraTopicPackage | undefined)) {
					throw new HttpsError('not-found', 'Scenario not found');
				}
				const counted = countCopy(
					markerSnap.data() as Partial<AgoraApprovedTeacher> | undefined,
					now,
				);
				if (!counted) {
					throw new HttpsError(
						'resource-exhausted',
						'You have taken many copies today — try again tomorrow',
					);
				}
				transaction.set(db.collection(Collections.agoraTopicPackages).doc(copyId), copy);
				transaction.update(originalRef, { 'stats.copyCount': FieldValue.increment(1) });
				transaction.set(markerRef(uid), counted, { merge: true });
			});

			return { copyId, translated };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.libraryUse',
				userId: uid,
				metadata: { scenarioId, lang },
			});
			throw new HttpsError('internal', 'Failed to copy the scenario');
		}
	},
);

/**
 * Library cards in the viewer's language. The client lists scenarios straight
 * from Firestore and asks here only for the ones written in another language;
 * each answer comes from the per-scenario cache when it can.
 */
export const agoraLibraryTranslate = onCall(
	{ region: functionConfig.region, timeoutSeconds: 120 },
	async (request: CallableRequest<LibraryTranslateRequest>): Promise<LibraryTranslateResponse> => {
		const { uid } = await requireApprovedTeacher(request);
		const { scenarioIds, lang } = request.data ?? ({} as LibraryTranslateRequest);
		if (typeof lang !== 'string' || !isAgoraLibraryLang(lang)) {
			throw new HttpsError('invalid-argument', 'lang must be a library language');
		}
		if (
			!Array.isArray(scenarioIds) ||
			scenarioIds.length > TRANSLATE_MAX_IDS ||
			scenarioIds.some((id) => typeof id !== 'string' || !id)
		) {
			throw new HttpsError(
				'invalid-argument',
				`scenarioIds must be up to ${TRANSLATE_MAX_IDS} ids`,
			);
		}

		try {
			const snaps = await db.getAll(
				...[...new Set(scenarioIds)].map((id) =>
					db.collection(Collections.agoraTopicPackages).doc(id),
				),
			);
			const translations: Record<string, AgoraScenarioCardText> = {};
			await Promise.all(
				snaps.map(async (snap) => {
					const pkg = snap.data() as AgoraTopicPackage | undefined;
					if (!pkg || pkg.language === lang) return;
					// Anyone's listed scenario, or my own
					if (!isListed(pkg) && pkg.creatorId !== uid) return;
					try {
						translations[snap.id] = await translatedCard(pkg, lang);
					} catch (error) {
						// One scenario failing to translate leaves it in its own language
						logError(error, {
							operation: 'agora.libraryTranslate.card',
							userId: uid,
							metadata: { scenarioId: snap.id, lang },
						});
					}
				}),
			);

			return { translations };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, { operation: 'agora.libraryTranslate', userId: uid, metadata: { lang } });
			throw new HttpsError('internal', 'Failed to translate');
		}
	},
);
