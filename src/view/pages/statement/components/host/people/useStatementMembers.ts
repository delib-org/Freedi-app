import { useMemo } from 'react';
import { createSelector } from '@reduxjs/toolkit';
import { StatementSubscription } from '@freedi/shared-types';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { RootState } from '@/redux/store';

/** Subscriptions of one space, from the members listener (memoised per id). */
export function useStatementMembers(statementId: string): StatementSubscription[] {
	const selectMembers = useMemo(
		() =>
			createSelector(
				(state: RootState) => state.statements.statementMembership,
				(memberships) => memberships.filter((membership) => membership.statementId === statementId),
			),
		[statementId],
	);

	return useAppSelector(selectMembers);
}
