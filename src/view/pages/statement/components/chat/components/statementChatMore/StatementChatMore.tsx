import { FC } from 'react';
import styles from './StatementChatMore.module.scss';

// Icons
import { useNavigate } from 'react-router';
import ChatIcon from '@/assets/icons/roundedChatDotIcon.svg?react';

// Statements functions

import { SimpleStatement, Statement, NotificationType } from 'delib-npm';
import { useSelector} from 'react-redux';
import { inAppNotificationsSelector } from '@/redux/notificationsSlice/notificationsSlice';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { markStatementNotificationsAsReadDB } from '@/controllers/db/inAppNotifications/db_inAppNotifications';
import UnreadBadge from '@/view/components/unreadBadge/UnreadBadge';

interface Props {
	statement: Statement | SimpleStatement;
	onlyCircle?: boolean;
	useLink?: boolean;
	asButton?: boolean;
}

const StatementChatMore: FC<Props> = ({
	statement,
	onlyCircle,
	useLink = true,
	asButton = true,
}) => {
	const navigate = useNavigate();

	// Redux store
	const creator = useSelector(creatorSelector);

	// ✅ Filter for UNREAD notifications only (with fallback for missing field)
	const unreadNotificationsList: NotificationType[] = useSelector(
		inAppNotificationsSelector
	).filter(
		(n) =>
			n.creatorId !== creator?.uid && 
			n.parentId === statement.statementId &&
			(!n.read || n.read === undefined) // ✅ Treat missing field as unread for backward compatibility
	);

	const handleClick = async () => {
		if (useLink) {
			// ✅ Mark notifications as read when navigating to chat
			if (unreadNotificationsList.length > 0) {
				await markStatementNotificationsAsReadDB(statement.statementId);
			}
			
			navigate(`/statement/${statement.statementId}/chat`, {
				state: { from: window.location.pathname },
			});
		}
	};

	const content = (
		<div className={styles.icon}>
			{unreadNotificationsList.length > 0 && (
				<UnreadBadge
					count={unreadNotificationsList.length}
					position="absolute"
					size="small"
					ariaLabel={`${unreadNotificationsList.length} unread response${unreadNotificationsList.length === 1 ? '' : 's'}`}
				/>
			)}
			{!onlyCircle && <ChatIcon />}
		</div>
	);

	return asButton ? (
		<button
			className={styles.statementChatMore}
			aria-label='Chat more button'
			onClick={handleClick}
		>
			{content}
		</button>
	) : (
		<div
			className={styles.statementChatMore}
			onClick={handleClick}
			role='button'
			tabIndex={0}
			onKeyDown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					handleClick();
				}
			}}
			aria-label='Chat more button'
		>
			{content}
		</div>
	);
};

export default StatementChatMore;
