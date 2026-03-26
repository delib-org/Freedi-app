import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Statement } from '@freedi/shared-types';
import { RootState } from '@/redux/store';

interface UseQuestionDeadlineReturn {
	deadline: number | undefined;
	durationMs: number | undefined;
	isPaused: boolean;
	remainingMsAtPause: number | undefined;
	isExpired: boolean;
	timeRemainingMs: number;
}

/**
 * Returns the nearest deadline from the current statement or any ancestor.
 * Understands paused state (pausedAt + remainingMsAtPause).
 * Ticks every second to update the countdown when running.
 */
export function useQuestionDeadline(statement: Statement | undefined): UseQuestionDeadlineReturn {
	const allStatements = useSelector((state: RootState) => state.statements.statements);

	// Find the nearest deadline: check current statement first, then walk up parents
	let deadline: number | undefined;
	let durationMs: number | undefined;
	let pausedAt: number | undefined;
	let remainingMsAtPause: number | undefined;

	const ownDeadline = statement?.questionSettings?.deadline;
	if (ownDeadline) {
		deadline = ownDeadline;
		durationMs = statement?.questionSettings?.durationMs;
		pausedAt = statement?.questionSettings?.pausedAt;
		remainingMsAtPause = statement?.questionSettings?.remainingMsAtPause;
	} else if (statement?.parents) {
		// Check closest parent first (reverse the array)
		for (let i = statement.parents.length - 1; i >= 0; i--) {
			const parentId = statement.parents[i];
			const parent = allStatements.find((s: Statement) => s.statementId === parentId);
			if (parent?.questionSettings?.deadline) {
				deadline = parent.questionSettings.deadline;
				durationMs = parent.questionSettings.durationMs;
				pausedAt = parent.questionSettings.pausedAt;
				remainingMsAtPause = parent.questionSettings.remainingMsAtPause;
				break;
			}
		}
	}

	const isPaused = Boolean(pausedAt);

	const [timeRemainingMs, setTimeRemainingMs] = useState(() => {
		if (!deadline) return 0;
		if (isPaused && remainingMsAtPause !== undefined) return remainingMsAtPause;

		return Math.max(0, deadline - Date.now());
	});

	useEffect(() => {
		if (!deadline) {
			setTimeRemainingMs(0);

			return;
		}

		// When paused, display the frozen remaining time and stop ticking
		if (isPaused && remainingMsAtPause !== undefined) {
			setTimeRemainingMs(remainingMsAtPause);

			return;
		}

		const update = () => setTimeRemainingMs(Math.max(0, deadline - Date.now()));
		update();

		const interval = setInterval(update, 1000);

		return () => clearInterval(interval);
	}, [deadline, isPaused, remainingMsAtPause]);

	return {
		deadline,
		durationMs,
		isPaused,
		remainingMsAtPause,
		isExpired: deadline ? !isPaused && timeRemainingMs <= 0 : false,
		timeRemainingMs,
	};
}
