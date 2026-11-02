import { useMemo } from 'react';
import { WaitingMember } from '@freedi/shared-types';
import { useApproveMembership } from '@/view/components/approveMembers/WaitingListVM';

/**
 * People asking to join this space, newest request first. Built on the
 * host-wide waiting list (one listener for the header badge and People).
 */
export function useStatementWaitingList(statementId: string): WaitingMember[] {
	const { waitingList } = useApproveMembership();

	return useMemo(
		() =>
			waitingList
				.filter((waiting) => waiting.statementId === statementId)
				.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
		[waitingList, statementId],
	);
}
