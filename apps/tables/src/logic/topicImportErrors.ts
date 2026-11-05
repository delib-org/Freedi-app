import { errorCode } from '@/logic/callableErrors';

/** Message key for a failed import read: not permitted, or anything else. */
export function classifyErrorCode(error: unknown): string {
	const code = errorCode(error);

	return code === 'permission-denied' || code === 'unauthenticated'
		? 'tableAssignment.import.denied'
		: 'tableAssignment.import.failed';
}
