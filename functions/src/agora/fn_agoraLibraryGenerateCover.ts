import { randomUUID } from 'node:crypto';
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { getStorage } from 'firebase-admin/storage';
import { db } from '../db';
import {
	AGORA_LIBRARY,
	AgoraApprovedTeacher,
	AgoraTopicPackage,
	Collections,
	LibraryGenerateCoverRequest,
	LibraryGenerateCoverResponse,
	functionConfig,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { countCover, markerRef, requireApprovedTeacher } from './libraryAccess';
import { coverDownloadUrl, coverObjectPath, coverSourceOf, COVER_IMAGE } from './libraryCover';
import { openAiCoverProvider, stubCoverProvider, type CoverProvider } from './libraryCoverProvider';
import { runCover } from './libraryCoverRun';

/** Swapped by tests and by the emulator when there is no key; production always uses OpenAI */
let provider: CoverProvider =
	process.env.FUNCTIONS_EMULATOR === 'true' && process.env.AGORA_COVER_STUB === '1'
		? stubCoverProvider
		: openAiCoverProvider;
export function setCoverProviderForTests(next: CoverProvider): void {
	provider = next;
}

/** Take one of today's generations, or say the day is used up. Returns what is left. */
async function reserve(uid: string): Promise<number> {
	return db.runTransaction(async (transaction) => {
		const snap = await transaction.get(markerRef(uid));
		const marker = snap.data() as Partial<AgoraApprovedTeacher> | undefined;
		const next = countCover(marker, Date.now());
		if (!next) {
			throw new HttpsError('resource-exhausted', 'Cover limit reached for today');
		}
		transaction.set(markerRef(uid), next, { merge: true });

		return AGORA_LIBRARY.COVERS_PER_DAY - (next.coversToday ?? 0);
	});
}

/** Give the generation back when nothing was painted */
async function release(uid: string): Promise<void> {
	await db.runTransaction(async (transaction) => {
		const snap = await transaction.get(markerRef(uid));
		const marker = snap.data() as Partial<AgoraApprovedTeacher> | undefined;
		if (!marker?.coversToday) return;
		transaction.set(markerRef(uid), { coversToday: marker.coversToday - 1 }, { merge: true });
	});
}

/**
 * Paint a cover for one of my scenarios from its own content (title, summary,
 * framing, question, roles, scene titles — never anything a student wrote),
 * store it under `agora/{scenarioId}/` and hand back its URL. If the scenario
 * is already listed, its card wears the new cover at once; otherwise the
 * publish sheet holds the URL until the teacher publishes.
 *
 * Limits: COVERS_PER_DAY a teacher (counter on the approval marker, given back
 * when nothing was painted). Cost: one image per call at COVER_IMAGE.MODEL.
 */
export const agoraLibraryGenerateCover = onCall(
	{ region: functionConfig.region, timeoutSeconds: 180, memory: '512MiB' },
	async (
		request: CallableRequest<LibraryGenerateCoverRequest>,
	): Promise<LibraryGenerateCoverResponse> => {
		const { uid } = await requireApprovedTeacher(request);
		const { scenarioId, summary } = request.data ?? ({} as LibraryGenerateCoverRequest);
		if (!scenarioId || typeof scenarioId !== 'string') {
			throw new HttpsError('invalid-argument', 'scenarioId is required');
		}
		if (summary !== undefined && typeof summary !== 'string') {
			throw new HttpsError('invalid-argument', 'summary must be a string');
		}
		if (provider === openAiCoverProvider && !process.env.OPENAI_API_KEY) {
			throw new HttpsError('failed-precondition', 'AI covers are not configured');
		}

		const packageRef = db.collection(Collections.agoraTopicPackages).doc(scenarioId);
		const snap = await packageRef.get();
		const pkg = snap.data() as AgoraTopicPackage | undefined;
		if (!pkg) throw new HttpsError('not-found', 'Scenario not found');
		if (pkg.creatorId !== uid) {
			throw new HttpsError('permission-denied', 'Only the scenario owner can make its cover');
		}

		const remaining = await reserve(uid);
		try {
			const outcome = await runCover(coverSourceOf(pkg, summary?.trim()), provider, (error) =>
				logError(error, { operation: 'agora.libraryGenerateCover.step', userId: uid }),
			);
			if (outcome.kind === 'refused') {
				await release(uid);
				throw new HttpsError('invalid-argument', 'This scenario cannot be illustrated');
			}

			const bucket = getStorage().bucket();
			const objectPath = coverObjectPath(scenarioId, Date.now());
			const token = randomUUID();
			await bucket.file(objectPath).save(outcome.bytes, {
				contentType: 'image/webp',
				metadata: {
					cacheControl: 'public, max-age=31536000',
					metadata: { firebaseStorageDownloadTokens: token },
				},
			});
			const coverUrl = coverDownloadUrl(
				bucket.name,
				objectPath,
				token,
				process.env.FIREBASE_STORAGE_EMULATOR_HOST,
			);

			const listed = pkg.visibility === 'public' && Boolean(pkg.library);
			if (listed) {
				await packageRef.update({ 'library.coverUrl': coverUrl, 'library.coverSource': 'ai' });
			}
			console.info('[agoraLibraryGenerateCover]', {
				uid,
				scenarioId,
				model: COVER_IMAGE.MODEL,
				approxCostUsd: COVER_IMAGE.APPROX_COST_USD,
			});

			return { coverUrl, applied: listed, remainingToday: remaining };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			await release(uid).catch(() => undefined);
			logError(error, {
				operation: 'agora.libraryGenerateCover',
				userId: uid,
				metadata: { scenarioId },
			});
			throw new HttpsError('internal', 'Failed to make the cover');
		}
	},
);
