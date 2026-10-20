import { Collections, OdysseyJourney, createOdysseyJourneyId } from '@freedi/shared-types';
import { db, doc, getDoc, setDoc } from './firebase';

/** The personal (non-deliberative) layer: compass, chosen islands, log. */

export interface LoadedJourney {
	journey: OdysseyJourney;
	/**
	 * true when the journey came back from Firestore; false for the blank one
	 * handed to a player who has not saved anything yet. A caller that wants
	 * to stamp something on an EXISTING voyage (the reading language) must not
	 * create one just to do it.
	 */
	persisted: boolean;
}

export async function loadJourney(uid: string, gameId: string): Promise<LoadedJourney> {
	const journeyId = createOdysseyJourneyId(uid, gameId);
	const snap = await getDoc(doc(db, Collections.odysseyJourneys, journeyId));
	if (snap.exists()) return { journey: snap.data() as OdysseyJourney, persisted: true };

	const now = Date.now();

	return {
		journey: {
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
		},
		persisted: false,
	};
}

export async function saveJourney(journey: OdysseyJourney): Promise<void> {
	await setDoc(
		doc(db, Collections.odysseyJourneys, journey.journeyId),
		{ ...journey, lastUpdate: Date.now() },
		{ merge: true },
	);
}
