import { useCallback, useEffect, useState } from 'react';
import { Role, StatementSubscription } from '@freedi/shared-types';
import { UI } from '@/constants/common';
import { updateMemberRole } from '@/controllers/db/subscriptions/setSubscriptions';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { fillPlaceholders } from '@/helpers/fillPlaceholders';
import { logError } from '@/utils/errorHandling';
import { MemberEntry, RoleAction, TARGET_ROLE } from './membersLogic';
import { PeopleToaster } from './usePeopleToast';

const OPERATION = 'people.useMemberRoleActions';

const TOAST_KEY: Record<RoleAction, string> = {
	makeHost: 'people.nowHostToast',
	removeHost: 'people.noLongerHostToast',
	block: 'people.blockedToast',
	unblock: 'people.unblockedToast',
};

export interface MemberRoleActions {
	/** Optimistic roles by subscription id, until the listener catches up. */
	roleOverrides: ReadonlyMap<string, Role>;
	/** Rows whose last write failed. */
	rowErrors: ReadonlySet<string>;
	run: (entry: MemberEntry, action: RoleAction) => void;
}

interface UseMemberRoleActionsOptions {
	statementId: string;
	members: ReadonlyArray<StatementSubscription>;
	toaster: PeopleToaster;
}

/**
 * Make host / Remove host / Block / Unblock — the one write path for a
 * person's role in this space (updateMemberRole on statementsSubscribe).
 * Optimistic, with an Undo toast that writes the previous role back; a
 * failure puts the row back and marks it (UX 4.4, 4.8).
 */
export function useMemberRoleActions({
	statementId,
	members,
	toaster,
}: UseMemberRoleActionsOptions): MemberRoleActions {
	const { t } = useTranslation();
	const { show: showToast, clear: clearToast } = toaster;
	const [roleOverrides, setRoleOverrides] = useState<ReadonlyMap<string, Role>>(() => new Map());
	const [rowErrors, setRowErrors] = useState<ReadonlySet<string>>(() => new Set());

	// Drop an override once Firestore reports the same role (or moved on).
	useEffect(() => {
		setRoleOverrides((prev) => {
			if (prev.size === 0) return prev;
			const next = new Map(prev);
			members.forEach((member) => {
				if (next.get(member.statementsSubscribeId) === member.role) {
					next.delete(member.statementsSubscribeId);
				}
			});

			return next.size === prev.size ? prev : next;
		});
	}, [members]);

	const setOverride = useCallback((id: string, role: Role | null) => {
		setRoleOverrides((prev) => {
			const next = new Map(prev);
			if (role) next.set(id, role);
			else next.delete(id);

			return next;
		});
	}, []);

	const setRowError = useCallback((id: string, hasError: boolean) => {
		setRowErrors((prev) => {
			if (prev.has(id) === hasError) return prev;
			const next = new Set(prev);
			if (hasError) next.add(id);
			else next.delete(id);

			return next;
		});
	}, []);

	/** One role write; resolves true when it landed. Never throws. */
	const writeRole = useCallback(
		async (entry: MemberEntry, role: Role): Promise<boolean> => {
			try {
				await updateMemberRole(statementId, entry.uid, role);

				return true;
			} catch (error) {
				logError(error, {
					operation: OPERATION,
					statementId,
					userId: entry.uid,
					metadata: { role },
				});

				return false;
			}
		},
		[statementId],
	);

	const undo = useCallback(
		async (entry: MemberEntry, previousRole: Role): Promise<void> => {
			showToast(null);
			setOverride(entry.id, previousRole);
			const isUndone = await writeRole(entry, previousRole);
			if (!isUndone) {
				setOverride(entry.id, null);
				showToast({
					message: t('people.couldNotUndo'),
					actionLabel: t('people.retry'),
					onAction: () => void undo(entry, previousRole),
					durationMs: UI.UNDO_TOAST_DURATION,
				});

				return;
			}
			showToast({ message: t('people.undone'), durationMs: UI.UNDONE_TOAST_DURATION });
		},
		[setOverride, showToast, t, writeRole],
	);

	const run = useCallback(
		(entry: MemberEntry, action: RoleAction): void => {
			const previousRole = entry.subscription.role;
			const targetRole = TARGET_ROLE[action];
			setRowError(entry.id, false);
			setOverride(entry.id, targetRole);
			const landed = writeRole(entry, targetRole);

			const toastId = showToast({
				message: fillPlaceholders(t(TOAST_KEY[action]), { name: entry.name }),
				actionLabel: t('people.undo'),
				onAction: () =>
					void landed.then((isLanded) => {
						if (isLanded) void undo(entry, previousRole);
					}),
				durationMs: UI.UNDO_TOAST_DURATION,
			});

			void landed.then((isLanded) => {
				if (isLanded) return;
				setOverride(entry.id, null);
				setRowError(entry.id, true);
				clearToast(toastId);
			});
		},
		[clearToast, setOverride, setRowError, showToast, t, undo, writeRole],
	);

	return { roleOverrides, rowErrors, run };
}
