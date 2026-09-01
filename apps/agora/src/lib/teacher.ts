import { parse } from 'valibot';
import {
	Collections,
	AgoraCamp,
	AgoraSession,
	AgoraSessionSchema,
	AgoraTopicPackage,
	AgoraTopicPackageSchema,
	VotingStageSettings,
	AGORA_VOTING,
	deriveCamp,
} from '@freedi/shared-types';
import {
	db,
	doc,
	collection,
	query,
	where,
	limit,
	getDoc,
	getDocs,
	setDoc,
	updateDoc,
	storage,
	storageRef,
	uploadBytesResumable,
	getDownloadURL,
} from './firebase';
import { trackWrite } from './confirmedWrite';

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

/** One topic package by id — the editor's load. Throws on a malformed doc. */
export async function fetchTopicPackage(topicPackageId: string): Promise<AgoraTopicPackage | null> {
	const snapshot = await getDoc(doc(db, Collections.agoraTopicPackages, topicPackageId));
	if (!snapshot.exists()) return null;

	return parse(AgoraTopicPackageSchema, snapshot.data());
}

/**
 * The fields the topic editor actually edits — the ONLY ones its save may
 * touch. The editor used to write its whole in-memory copy back, which made
 * every save an overwrite of fields it never showed (creator, language,
 * rubric, metrics) with whatever they were when the editor was opened.
 */
export type TopicEditorFields = Partial<
	Pick<
		AgoraTopicPackage,
		'title' | 'framingText' | 'challengeQuestion' | 'characters' | 'scenes' | 'status'
	>
>;

/**
 * Save the editor's fields — under the confirmed-write clock, because a
 * teacher polishing a package on flaky wifi was the textbook silent failure:
 * Firestore queues, the button flashes "saved", and the package still says
 * what it said. The stalled banner now has something to report.
 */
export async function saveTopicEditorFields(
	topicPackageId: string,
	fields: TopicEditorFields,
): Promise<void> {
	await trackWrite(
		'editor.saving_package',
		updateDoc(doc(db, Collections.agoraTopicPackages, topicPackageId), {
			...fields,
			lastUpdate: Date.now(),
		}),
	);
}

/**
 * Upload one scene asset (video or image) into the package's storage folder.
 * Progress arrives as whole percents; resolves with the download URL to write
 * onto the scene. Storage lives here so no view imports firebase for it.
 */
export function uploadTopicAsset(
	topicPackageId: string,
	fileName: string,
	file: File,
	onProgress: (percent: number) => void,
): Promise<string> {
	const task = uploadBytesResumable(
		storageRef(storage, `agora/${topicPackageId}/${fileName}`),
		file,
	);

	return new Promise<string>((resolve, reject) => {
		task.on(
			'state_changed',
			(snapshot) => {
				onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
			},
			reject,
			() => {
				getDownloadURL(task.snapshot.ref).then(resolve).catch(reject);
			},
		);
	});
}

export async function patchTopicPackage(
	topicPackageId: string,
	patch: Partial<AgoraTopicPackage>,
): Promise<void> {
	await updateDoc(doc(db, Collections.agoraTopicPackages, topicPackageId), patch);
}

/**
 * How the vote will run: which proposals reach the ballot, and what it takes
 * to win it.
 *
 * The teacher owns this; the ballot itself is server-drawn and rules-frozen,
 * so nothing here can name a candidate. `numberOfResults` is clamped before it
 * is written — a ballot of one is not an election, and a ballot of forty is
 * not a decision.
 */
export async function setVotingSettings(
	sessionId: string,
	settings: VotingStageSettings,
): Promise<void> {
	const selection = settings.selection;
	const clamped: VotingStageSettings = {
		...settings,
		...(selection
			? {
					selection: {
						...selection,
						...(selection.numberOfResults !== undefined
							? {
									numberOfResults: Math.min(
										AGORA_VOTING.MAX_TOP_X,
										Math.max(AGORA_VOTING.MIN_TOP_X, Math.round(selection.numberOfResults)),
									),
								}
							: {}),
					},
				}
			: {}),
	};

	await updateDoc(doc(db, Collections.agoraSessions, sessionId), {
		votingSettings: clamped,
		lastUpdate: Date.now(),
	});
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
