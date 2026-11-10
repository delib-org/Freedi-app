import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { unreadMessagesSelector } from '@/redux/statements/unreadSelectors';

/** Unread chat messages and answers below a card; 0 means show nothing. */
export function useUnreadMessageCount(statementId: string | undefined): number {
	return useAppSelector(unreadMessagesSelector(statementId));
}
