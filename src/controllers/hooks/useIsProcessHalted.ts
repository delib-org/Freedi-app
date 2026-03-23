import { Statement } from '@freedi/shared-types';
import { useQuestionDeadline } from './useQuestionDeadline';

interface UseIsProcessHaltedReturn {
	isHalted: boolean;
	isManuallyHalted: boolean;
	isTimerExpired: boolean;
}

/**
 * Checks if the democratic process is halted for the given statement.
 * Halted means: no options, no evaluation, no voting — but comments and questions are allowed.
 * Only checks the current statement level (not parents).
 */
export function useIsProcessHalted(
	statement: Statement | undefined,
): UseIsProcessHaltedReturn {
	const { isExpired } = useQuestionDeadline(statement);
	const isManuallyHalted = statement?.questionSettings?.isHalted === true;
	const isTimerExpired = isExpired;

	return {
		isHalted: isManuallyHalted || isTimerExpired,
		isManuallyHalted,
		isTimerExpired,
	};
}
