import { parse } from 'valibot';
import {
	Collections,
	AgoraCamp,
	AgoraSession,
	AgoraSessionSchema,
	AgoraTopicPackage,
	AgoraTopicPackageSchema,
	deriveCamp,
} from '@freedi/shared-types';
import { db, doc, collection, query, where, limit, getDocs, setDoc, updateDoc } from './firebase';

/**
 * Everything the teacher and join screens ask of Firestore.
 *
 * The student path has had a data layer since the beginning — views render,
 * lib/proposals.ts and lib/session.ts talk to the database. The teacher path
 * never did: five views built their own queries, parsed their own documents and
 * swallowed their own errors. That is the surface with no e2e coverage worth
 * the name, and the surface most exposed to a rules change, because nobody
 * finds out it broke until a teacher is standing in front of a class.
 *
 * One place now knows the collection names and the schemas. The views keep
 * their own state and their own decisions.
 */

/** A session looked up by its join code, or null when the code is wrong. */
export async function findSessionByCode(code: string): Promise<AgoraSession | null> {
	const snapshot = await getDocs(
		query(collection(db, Collections.agoraSessions), where('code', '==', code), limit(1)),
	);
	if (snapshot.empty) return null;

	try {
		return parse(AgoraSessionSchema, snapshot.docs[0].data());
	} catch (error) {
		console.error('[Teacher] Invalid session doc:', error);

		return null;
	}
}

/**
 * The topic packages this teacher owns.
 *
 * Invalid documents are skipped rather than fatal: one malformed package must
 * not empty a teacher's whole library thirty seconds before a lesson.
 */
export async function listTopicPackages(creatorId: string): Promise<AgoraTopicPackage[]> {
	const snapshot = await getDocs(
		query(collection(db, Collections.agoraTopicPackages), where('creatorId', '==', creatorId)),
	);
	const packages: AgoraTopicPackage[] = [];
	snapshot.forEach((docSnap) => {
		try {
			packages.push(parse(AgoraTopicPackageSchema, docSnap.data()));
		} catch (error) {
			console.error('[Teacher] Invalid topic package:', error);
		}
	});

	return packages;
}

export async function saveTopicPackage(topicPackage: AgoraTopicPackage): Promise<void> {
	await setDoc(doc(db, Collections.agoraTopicPackages, topicPackage.topicPackageId), topicPackage);
}

export async function patchTopicPackage(
	topicPackageId: string,
	patch: Partial<AgoraTopicPackage>,
): Promise<void> {
	await updateDoc(doc(db, Collections.agoraTopicPackages, topicPackageId), patch);
}

/**
 * Where a student placed themselves between the two camps.
 *
 * The camp is derived here rather than taken from the caller, so the one rule
 * that turns a slider position into a side cannot be stated twice — it decides
 * the bridging denominator for every proposal in the room.
 */
export async function saveCampPosition(
	participantId: string,
	campPosition: number,
): Promise<{ camp: AgoraCamp }> {
	const camp = deriveCamp(campPosition);
	await updateDoc(doc(db, Collections.agoraParticipants, participantId), {
		campPosition,
		camp,
		lastActive: Date.now(),
	});

	return { camp };
}
