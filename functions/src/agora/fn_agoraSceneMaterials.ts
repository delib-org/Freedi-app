import { randomUUID } from 'crypto';
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { getStorage } from 'firebase-admin/storage';
import { db } from '../db';
import {
	AGORA_MATERIALS,
	Collections,
	createAgoraSceneMaterialsId,
	functionConfig,
} from '@freedi/shared-types';
import type {
	AgoraMaterialItem,
	AgoraSceneMaterials,
	AgoraTopicPackage,
	SceneMaterialsRequest,
	SceneMaterialsResponse,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { extractPdfText, fetchLinkText, type ExtractResult } from './materialsExtract';
import {
	clampText,
	cleanTitle,
	isMaterialStoragePath,
	normalizeText,
	parseDownloadUrl,
	remainingChars,
} from './materialsText';

/** A source with less room than this left on the scene is refused rather than cut to a stub */
const MIN_ROOM_CHARS = 200;

function totalChars(items: readonly AgoraMaterialItem[]): number {
	return items.reduce((sum, item) => sum + item.charCount, 0);
}

function sourceToItem(
	kind: AgoraMaterialItem['kind'],
	title: string,
	extracted: ExtractResult & { ok: true },
	extra: Partial<AgoraMaterialItem>,
	now: number,
): AgoraMaterialItem {
	const { text, truncated, pageCount } = extracted.value;

	return {
		materialId: randomUUID().slice(0, 12),
		kind,
		title,
		text,
		charCount: text.length,
		...(truncated ? { truncated: true } : {}),
		...(pageCount !== undefined ? { pageCount } : {}),
		...extra,
		addedAt: now,
	};
}

async function deleteStoredFile(
	fileUrl: string | undefined,
	topicPackageId: string,
): Promise<void> {
	const parsed = fileUrl ? parseDownloadUrl(fileUrl) : null;
	if (!parsed || !isMaterialStoragePath(topicPackageId, parsed.path)) return;
	try {
		await getStorage().bucket(parsed.bucket).file(parsed.path).delete({ ignoreNotFound: true });
	} catch (error) {
		logError(error, { operation: 'agora.sceneMaterials.deleteFile', metadata: { topicPackageId } });
	}
}

/**
 * Teacher-only: attach, or take off, background materials on one scene of a
 * lesson they own. Text is extracted HERE (PDF → text, link → fetched page →
 * readable text) and the extracted text is what is stored, so what the
 * teacher sees as "N characters" is exactly what the AI will read.
 */
export const agoraSceneMaterials = onCall(
	{ region: functionConfig.region, timeoutSeconds: 60, memory: '512MiB' },
	async (request: CallableRequest<SceneMaterialsRequest>): Promise<SceneMaterialsResponse> => {
		const uid = request.auth?.uid;
		if (!uid) throw new HttpsError('unauthenticated', 'User must be authenticated');
		const data = request.data;
		if (!data || typeof data.topicPackageId !== 'string' || typeof data.sceneId !== 'string') {
			throw new HttpsError('invalid-argument', 'topicPackageId and sceneId are required');
		}
		const { topicPackageId, sceneId } = data;

		try {
			const packageSnap = await db
				.collection(Collections.agoraTopicPackages)
				.doc(topicPackageId)
				.get();
			const topic = packageSnap.data() as (AgoraTopicPackage & { creatorId?: string }) | undefined;
			if (!topic) throw new HttpsError('not-found', 'Lesson not found');
			if (topic.creatorId !== uid) {
				throw new HttpsError('permission-denied', 'Only the lesson owner can edit materials');
			}
			if (!topic.scenes.some((scene) => scene.sceneId === sceneId)) {
				throw new HttpsError('not-found', 'Scene not found');
			}

			const now = Date.now();
			if (data.action === 'remove') {
				return await removeMaterial(
					uid,
					topicPackageId,
					sceneId,
					String(data.materialId ?? ''),
					now,
				);
			}

			return await addMaterial({ uid, topicPackageId, sceneId, request: data, now });
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.sceneMaterials',
				userId: uid,
				metadata: { topicPackageId, sceneId, action: data.action },
			});
			throw new HttpsError('internal', 'Materials update failed');
		}
	},
);

export async function removeMaterial(
	uid: string,
	topicPackageId: string,
	sceneId: string,
	materialId: string,
	now: number,
): Promise<SceneMaterialsResponse> {
	const ref = db
		.collection(Collections.agoraSceneMaterials)
		.doc(createAgoraSceneMaterialsId(topicPackageId, sceneId));
	const { next, gone } = await db.runTransaction(async (transaction) => {
		const current = (await transaction.get(ref)).data() as AgoraSceneMaterials | undefined;
		const items = current?.items ?? [];
		const kept = items.filter((item) => item.materialId !== materialId);
		transaction.set(ref, {
			topicPackageId,
			sceneId,
			teacherId: uid,
			items: kept,
			lastUpdate: now,
		} satisfies AgoraSceneMaterials);

		return { next: kept, gone: items.find((item) => item.materialId === materialId) };
	});
	if (gone?.fileUrl) await deleteStoredFile(gone.fileUrl, topicPackageId);

	return { ok: true, items: next };
}

/* The add paths are split out so the extraction (slow, can fail with a reason) runs
 * before the short write transaction. */
export interface AddInput {
	uid: string;
	topicPackageId: string;
	sceneId: string;
	request: SceneMaterialsRequest;
	now: number;
}

export async function addMaterial(input: AddInput): Promise<SceneMaterialsResponse> {
	const { uid, topicPackageId, sceneId, request, now } = input;
	const ref = db
		.collection(Collections.agoraSceneMaterials)
		.doc(createAgoraSceneMaterialsId(topicPackageId, sceneId));
	const existing = (await ref.get()).data() as AgoraSceneMaterials | undefined;
	const items = existing?.items ?? [];
	if (items.length >= AGORA_MATERIALS.MAX_ITEMS) return { ok: false, reason: 'too_many' };
	const room = Math.min(AGORA_MATERIALS.MAX_ITEM_CHARS, remainingChars(totalChars(items)));
	if (room < MIN_ROOM_CHARS) return { ok: false, reason: 'too_big' };

	let item: AgoraMaterialItem;
	switch (request.action) {
		case 'addText': {
			const text = normalizeText(String(request.text ?? ''));
			if (!text) return { ok: false, reason: 'empty' };
			const clamped = clampText(text, room);
			item = sourceToItem(
				'text',
				cleanTitle(request.title, text.slice(0, 40)),
				{ ok: true, value: clamped },
				{},
				now,
			);
			break;
		}
		case 'addPdf': {
			const parsed = parseDownloadUrl(String(request.fileUrl ?? ''));
			if (
				!parsed ||
				parsed.path !== request.storagePath ||
				!isMaterialStoragePath(topicPackageId, parsed.path)
			) {
				return { ok: false, reason: 'pdf_unreadable' };
			}
			let buffer: Buffer;
			try {
				[buffer] = await getStorage().bucket(parsed.bucket).file(parsed.path).download();
			} catch (error) {
				logError(error, {
					operation: 'agora.sceneMaterials.download',
					userId: uid,
					metadata: { topicPackageId },
				});

				return { ok: false, reason: 'pdf_unreadable' };
			}
			const extracted = await extractPdfText(buffer, room);
			if (!extracted.ok) {
				await deleteStoredFile(request.fileUrl, topicPackageId);

				return { ok: false, reason: extracted.reason };
			}
			const fallback =
				parsed.path
					.split('/')
					.pop()
					?.replace(/\.pdf$/i, '') ?? 'PDF';
			item = sourceToItem(
				'pdf',
				cleanTitle(request.title, fallback),
				extracted,
				{ fileUrl: request.fileUrl, storagePath: parsed.path },
				now,
			);
			break;
		}
		case 'addLink': {
			const fetched = await fetchLinkText(String(request.url ?? ''), room);
			if (!fetched.ok) return { ok: false, reason: fetched.reason };
			const sourceUrl = String(request.url).trim();
			item = sourceToItem(
				'link',
				cleanTitle(request.title ?? fetched.value.title, sourceUrl),
				fetched,
				{ sourceUrl },
				now,
			);
			break;
		}
		default:
			return { ok: false, reason: 'empty' };
	}

	// Two teachers' tabs adding at once: re-read inside the write and re-check the caps
	return db.runTransaction(async (transaction): Promise<SceneMaterialsResponse> => {
		const fresh = (await transaction.get(ref)).data() as AgoraSceneMaterials | undefined;
		const freshItems = fresh?.items ?? [];
		if (
			freshItems.length >= AGORA_MATERIALS.MAX_ITEMS ||
			totalChars(freshItems) + item.charCount > AGORA_MATERIALS.MAX_TOTAL_CHARS
		) {
			return {
				ok: false,
				reason: freshItems.length >= AGORA_MATERIALS.MAX_ITEMS ? 'too_many' : 'too_big',
			};
		}
		const next = [...freshItems, item];
		transaction.set(ref, {
			topicPackageId,
			sceneId,
			teacherId: uid,
			items: next,
			lastUpdate: now,
		} satisfies AgoraSceneMaterials);

		return { ok: true, items: next };
	});
}
