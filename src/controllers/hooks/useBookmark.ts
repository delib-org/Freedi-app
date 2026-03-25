import { useCallback } from 'react';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { isStatementBookmarkedSelector } from '@/redux/statements/statementsSlice';
import { toggleBookmark } from '@/controllers/db/subscriptions/toggleBookmark';

interface UseBookmarkReturn {
	isBookmarked: boolean;
	toggle: () => void;
}

export function useBookmark(statementId: string): UseBookmarkReturn {
	const { user } = useAuthentication();
	const isBookmarked = useAppSelector(isStatementBookmarkedSelector(statementId));

	const toggle = useCallback(() => {
		toggleBookmark({ statementId, userId: user?.uid ?? '' });
	}, [statementId, user?.uid]);

	return { isBookmarked, toggle };
}
