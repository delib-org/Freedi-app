import { Collections, OdysseyJourney, createOdysseyJourneyId } from '@freedi/shared-types';
import { db, doc, getDoc, setDoc } from './firebase';

/** The personal (non-deliberative) layer: compass, chosen islands, log. */

export async function loadJourney(uid: string, gameId: string): Promise<OdysseyJourney> {
	const journeyId = createOdysseyJourneyId(uid, gameId);
	const snap = await getDoc(doc(db, Collections.odysseyJourneys, journeyId));
	if (snap.exists()) return snap.data() as OdysseyJourney;

	const now = Date.now();

	return {
		journeyId,
		gameId,
		userId: uid,
		displayName: null,
		compassAnswers: {},
		valueRankings: {},
		selectedIslandIds: [],
		depthAnswers: {},
		logEntries: [],
		createdAt: now,
		lastUpdate: now,
	};
}

export async function saveJourney(journey: OdysseyJourney): Promise<void> {
	await setDoc(
		doc(db, Collections.odysseyJourneys, journey.journeyId),
		{ ...journey, lastUpdate: Date.now() },
		{ merge: true },
	);
}
