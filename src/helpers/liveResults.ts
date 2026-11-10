import { Statement } from '@freedi/shared-types';

/**
 * Whether the host turned on live results for participants. Off unless a host
 * set it, so an unset question never shows scores to people still responding.
 */
export function isLiveResultsOn(statement: Statement | undefined | null): boolean {
	return statement?.statementSettings?.showEvaluation === true;
}
