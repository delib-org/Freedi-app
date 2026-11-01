import { useCallback, useEffect, useMemo, useState } from 'react';
import { WaitingMember } from '@freedi/shared-types';
import { UI } from '@/constants/common';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { fillPlaceholders } from '@/helpers/fillPlaceholders';
import {
	approveMultiple,
	rejectMultiple,
	returnMultipleToWaiting,
} from '@/services/membershipActions';
import { PeopleToaster } from './usePeopleToast';

export type WaitingDecision = 'letIn' | 'decline';

export interface WaitingDecisions {
	/** Waiting people not optimistically removed by a decision in flight. */
	visible: WaitingMember[];
	/** The decision that failed for a row, keyed by subscription id. */
	rowErrors: ReadonlyMap<string, WaitingDecision>;
	decide: (targets: ReadonlyArray<WaitingMember>, decision: WaitingDecision) => void;
}

const WRITE: Record<WaitingDecision, typeof approveMultiple> = {
	letIn: approveMultiple,
	decline: rejectMultiple,
};

const idOf = (member: WaitingMember): string => member.statementsSubscribeId;

/**
 * Let in / Decline with Undo (UX main-people-settings §4.3, §4.8). Rows leave
 * at once; a failed write puts exactly the failed rows back with an inline
 * error. Undo waits for the decision to land, then returns those people to
 * the waiting list.
 */
export function useWaitingDecisions(
	members: ReadonlyArray<WaitingMember>,
	toaster: PeopleToaster,
): WaitingDecisions {
	const { t } = useTranslation();
	const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(() => new Set());
	const [rowErrors, setRowErrors] = useState<ReadonlyMap<string, WaitingDecision>>(() => new Map());
	const { show: setToast, clear: clearToast } = toaster;

	// A hidden row stays hidden only while the listener still lists it (the
	// write is in flight). Once the person is gone, forget them: a declined
	// person who asks again comes back under the same subscription id and
	// must show up, not stay hidden until the page reloads.
	useEffect(() => {
		setHiddenIds((prev) => {
			if (prev.size === 0) return prev;
			const listed = new Set(members.map(idOf));
			const next = new Set([...prev].filter((id) => listed.has(id)));

			return next.size === prev.size ? prev : next;
		});
	}, [members]);

	const setHidden = useCallback((ids: ReadonlyArray<string>, isHidden: boolean) => {
		setHiddenIds((prev) => {
			const next = new Set(prev);
			ids.forEach((id) => (isHidden ? next.add(id) : next.delete(id)));

			return next;
		});
	}, []);

	const setErrors = useCallback((ids: ReadonlyArray<string>, decision: WaitingDecision | null) => {
		setRowErrors((prev) => {
			const next = new Map(prev);
			ids.forEach((id) => (decision ? next.set(id, decision) : next.delete(id)));

			return next;
		});
	}, []);

	const decisionMessage = useCallback(
		(targets: ReadonlyArray<WaitingMember>, decision: WaitingDecision): string => {
			if (targets.length === 1) {
				const key = decision === 'letIn' ? 'people.letInToast' : 'people.declinedToast';

				return fillPlaceholders(t(key), { name: targets[0].user?.displayName ?? '' });
			}
			const key = decision === 'letIn' ? 'people.letInCount' : 'people.declinedCount';

			return fillPlaceholders(t(key), { count: targets.length });
		},
		[t],
	);

	const undo = useCallback(
		async (decided: ReadonlyArray<WaitingMember>): Promise<void> => {
			setToast(null);
			const failed = await returnMultipleToWaiting(decided);
			if (failed.length > 0) {
				setToast({
					message: t('people.couldNotUndo'),
					actionLabel: t('people.retry'),
					onAction: () => void undo(failed),
					durationMs: UI.UNDO_TOAST_DURATION,
				});

				return;
			}
			setHidden(decided.map(idOf), false);
			setToast({ message: t('people.undone'), durationMs: UI.UNDONE_TOAST_DURATION });
		},
		[setHidden, setToast, t],
	);

	const decide = useCallback(
		(targets: ReadonlyArray<WaitingMember>, decision: WaitingDecision): void => {
			if (targets.length === 0) return;
			const ids = targets.map(idOf);
			setHidden(ids, true);
			setErrors(ids, null);
			const written = WRITE[decision](targets);
			const landed = written.then((failed) => targets.filter((m) => !failed.includes(m)));

			const toastId = setToast({
				message: decisionMessage(targets, decision),
				actionLabel: t('people.undo'),
				onAction: () => void landed.then(undo),
				durationMs: UI.UNDO_TOAST_DURATION,
			});

			void written.then((failed) => {
				if (failed.length === 0) return;
				const failedIds = failed.map(idOf);
				setHidden(failedIds, false);
				setErrors(failedIds, decision);
				if (failed.length === targets.length) clearToast(toastId);
			});
		},
		[clearToast, decisionMessage, setErrors, setHidden, setToast, t, undo],
	);

	const visible = useMemo(
		() => members.filter((member) => !hiddenIds.has(idOf(member))),
		[members, hiddenIds],
	);

	return { visible, rowErrors, decide };
}
