import { httpsCallable } from 'firebase/functions';
import { functions } from '../config';
import { logError } from '@/utils/errorHandling';

interface BackupSurveyRequest {
	questionId: string;
}

interface BackupSurveyResponse {
	ok: true;
	destination: string;
	message: string;
}

export async function requestSurveyBackup(questionId: string): Promise<BackupSurveyResponse> {
	try {
		const callable = httpsCallable<BackupSurveyRequest, BackupSurveyResponse>(
			functions,
			'backupSurveyCallable',
		);
		const result = await callable({ questionId });

		return result.data;
	} catch (error) {
		logError(error, { operation: 'backupController.requestSurveyBackup', statementId: questionId });
		throw error;
	}
}
