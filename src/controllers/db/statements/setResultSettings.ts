import { Collections, ResultsSettings, ResultsSettingsSchema } from '@freedi/shared-types';
import { doc, updateDoc } from 'firebase/firestore';
import { DB } from '../config';
import { parse } from 'valibot';
import { logError } from '@/utils/errorHandling';
import { getCurrentTimestamp } from '@/utils/firebaseUtils';

export async function updateResultSettingsToDB(
	statementId: string,
	resultsSettings: ResultsSettings,
) {
	try {
		const resultSettingsRef = doc(DB, Collections.statements, statementId);
		parse(ResultsSettingsSchema, resultsSettings);
		await updateDoc(resultSettingsRef, { resultsSettings, lastUpdate: getCurrentTimestamp() });
	} catch (error) {
		logError(error, { operation: 'statements.setResultSettings.updateResultSettingsToDB' });
	}
}
