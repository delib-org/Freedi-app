import { useCallback } from 'react';
import type { ActivityRunState } from '@freedi/event-core';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useToastUndo } from '@/components/atomic/molecules/ToastUndo';
import { runStateToQuestionStatus, setQuestionStatus } from '@/db/statements';

/**
 * Change an activity's run state and, for the reversible open ↔ frozen
 * moves, show an undo toast that restores the previous state. Closing (and
 * reopening from closed) is confirmed inline by StatusControl instead.
 */
export type ChangeStatusWithUndo = (
	statementId: string,
	previous: ActivityRunState,
	next: ActivityRunState,
) => Promise<void>;

function undoMessageFor(
	previous: ActivityRunState,
	next: ActivityRunState,
	t: (text: string) => string,
): string | null {
	if (next === 'frozen') return t('Frozen — participants can look but not act');
	if (next === 'open' && previous === 'frozen') return t('Reopened — participants can act again');
	if (next === 'open' && previous === 'queued') return t('Opened — participants can take part');

	return null;
}

export function useStatusWithUndo(): ChangeStatusWithUndo {
	const { t } = useTranslation();
	const { showUndo } = useToastUndo();

	return useCallback(
		async (statementId, previous, next) => {
			await setQuestionStatus(statementId, runStateToQuestionStatus(next));
			const message = undoMessageFor(previous, next, t);
			if (!message) return;
			showUndo({
				message,
				onUndo: () => void setQuestionStatus(statementId, runStateToQuestionStatus(previous)),
			});
		},
		[showUndo, t],
	);
}
