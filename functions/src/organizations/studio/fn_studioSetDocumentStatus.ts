import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { QuestionStatus, functionConfig } from '@freedi/shared-types';
import { assertStatementAdmin } from '../../progress/assertStatementAdmin';
import { getCallerIdentity } from '../orgInvites';
import { isSignDocument, setDocumentStatus } from './documentStatus';

export interface SetDocumentStatusRequest {
	statementId: string;
	status: 'open' | 'frozen' | 'closed';
}

const STATUS_MAP: Record<SetDocumentStatusRequest['status'], QuestionStatus> = {
	open: 'live',
	frozen: 'frozen',
	closed: 'closed',
};

/** Open for comment / freeze / close a Sign document from the Studio dashboard. */
export const fn_studioSetDocumentStatus = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<SetDocumentStatusRequest>,
	): Promise<{ statementId: string; status: SetDocumentStatusRequest['status'] }> => {
		const caller = getCallerIdentity(request);
		const { statementId, status } = request.data ?? {};
		if (!statementId || typeof statementId !== 'string') {
			throw new HttpsError('invalid-argument', 'statementId is required');
		}
		if (!(status in STATUS_MAP)) {
			throw new HttpsError('invalid-argument', 'status must be open | frozen | closed');
		}
		const { statement } = await assertStatementAdmin(
			caller.uid,
			statementId,
			'studio.document.status',
		);
		if (!isSignDocument(statement)) {
			throw new HttpsError('failed-precondition', 'Not a document');
		}
		await setDocumentStatus(statementId, STATUS_MAP[status], Date.now());

		return { statementId, status };
	},
);
