import { setDoc } from 'firebase/firestore';
import { ResultsBy } from '@freedi/shared-types';
import { createStatementRef } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';

export async function updateResultsSettings(
	statementId: string,
	resultsBy: ResultsBy = ResultsBy.consensus,
	numberOfResults = 3,
) {
	try {
		const statementRef = createStatementRef(statementId);

		const results = {
			numberOfResults,
			resultsBy,
		};

		await setDoc(statementRef, { results }, { merge: true });
	} catch (error) {
		logError(error, { operation: 'results.setResults.updateResultsSettings' });
	}
}
