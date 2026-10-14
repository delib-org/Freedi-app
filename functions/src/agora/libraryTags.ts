import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	AGORA_LIBRARY,
	AgoraLibraryTag,
	AgoraTopicPackage,
	Collections,
	repointTagIds,
} from '@freedi/shared-types';

/** Scenarios re-pointed per batch, with the two counter updates that belong to them */
const BATCH_SIZE = 400;

const tagRef = (id: string) => db.collection(Collections.agoraLibraryTags).doc(id);

/** Does the library list this scenario right now? Tag counters count exactly these. */
const isListed = (pkg: AgoraTopicPackage): boolean =>
	pkg.visibility === 'public' && pkg.library?.hidden !== true;

/**
 * Merge a duplicate tag (`fromId`) into the canonical one (`intoId`).
 *
 *  1. The duplicate is marked `aliasOf: intoId` FIRST. From then on no new
 *     scenario can take it (publish refuses an aliased tag), a teacher typing
 *     its words is handed the canonical tag, and the picker stops offering it.
 *  2. Every scenario carrying it (listed, hidden or private: the `library`
 *     card stays on the document) is re-pointed to the canonical tag, in
 *     batches. A scenario that already carried both keeps one.
 *  3. Each batch moves the tag counters with the scenarios it covers, in the
 *     same commit, so the counts are exact after every batch and a merge that
 *     stops half-way is simply run again: the scenarios still carrying the
 *     duplicate are the ones left to move.
 *
 * Returns how many scenarios were re-pointed.
 */
export async function mergeTags(fromId: string, intoId: string): Promise<number> {
	if (fromId === intoId) throw new HttpsError('invalid-argument', 'A tag cannot merge into itself');
	const [fromSnap, intoSnap] = await Promise.all([tagRef(fromId).get(), tagRef(intoId).get()]);
	const from = fromSnap.data() as AgoraLibraryTag | undefined;
	const into = intoSnap.data() as AgoraLibraryTag | undefined;
	if (!from || !into) throw new HttpsError('not-found', 'Tag not found');
	if (from.kind !== into.kind) {
		throw new HttpsError('invalid-argument', 'Only tags of the same kind can be merged');
	}
	if (into.aliasOf) {
		throw new HttpsError('failed-precondition', 'The target tag has itself been merged away');
	}
	if (from.aliasOf && from.aliasOf !== intoId) {
		throw new HttpsError('failed-precondition', 'That tag was already merged into another one');
	}
	if (!from.aliasOf) {
		await tagRef(fromId).update({ aliasOf: intoId, lastUpdate: Date.now() });
	}

	const field = from.kind === 'subject' ? 'library.subjectIds' : 'library.lessonTypeIds';
	const key = from.kind === 'subject' ? 'subjectIds' : 'lessonTypeIds';
	let moved = 0;
	let teachers = new Set(into.teacherIds);
	for (;;) {
		const page = await db
			.collection(Collections.agoraTopicPackages)
			.where(field, 'array-contains', fromId)
			.limit(BATCH_SIZE)
			.get();
		if (page.empty) break;
		const batch = db.batch();
		let freed = 0;
		let gained = 0;
		for (const doc of page.docs) {
			const pkg = doc.data() as AgoraTopicPackage;
			const ids = pkg.library?.[key] ?? [];
			const next = repointTagIds(ids, fromId, intoId);
			const hadInto = ids.includes(intoId);
			if (isListed(pkg)) {
				freed += 1;
				if (!hadInto) gained += 1;
			}
			if (pkg.library?.authorId) teachers.add(pkg.library.authorId);
			batch.update(doc.ref, { [field]: next.ids });
		}
		teachers = new Set([...teachers].slice(0, AGORA_LIBRARY.TAG_TEACHER_CAP));
		const now = Date.now();
		batch.update(tagRef(fromId), { scenarioCount: FieldValue.increment(-freed), lastUpdate: now });
		batch.update(tagRef(intoId), {
			scenarioCount: FieldValue.increment(gained),
			teacherIds: [...teachers],
			lastUpdate: now,
		});
		await batch.commit();
		moved += page.size;
	}

	return moved;
}
