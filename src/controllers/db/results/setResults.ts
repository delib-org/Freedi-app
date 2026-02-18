import { doc, setDoc } from 'firebase/firestore';
import { FireStore } from '../config';
import { ResultsBy, Collections } from '@freedi/shared-types';

export async function updateResultsSettings(
	statementId: string,
	resultsBy: ResultsBy = ResultsBy.consensus,
	numberOfResults = 3,
) {
	try {
		const statementRef = doc(FireStore, Collections.statements, statementId);

		const results = {
			numberOfResults,
			resultsBy,
		};

		await setDoc(statementRef, { results }, { merge: true });
	} catch (error) {
		console.error(error);
	}
}
