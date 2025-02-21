import { doc, setDoc } from 'firebase/firestore';
import { FireStore } from '../config';
import { Collections } from '@/types/TypeEnums';
import { ResultsBy } from '@/types/results/Results';

export async function updateResultsSettings(
	statementId: string,
	resultsBy: ResultsBy = ResultsBy.topOptions,
	numberOfResults = 3
) {
	try {
		const statementRef = doc(
			FireStore,
			Collections.statements,
			statementId
		);

		const results = {
			numberOfResults,
			resultsBy,
		};

		await setDoc(statementRef, { results }, { merge: true });
	} catch (error) {
		console.error(error);
	}
}
