import { FC, useMemo } from 'react';
import styles from './StatementChatMore.module.scss';

// Icons
import { useNavigate } from 'react-router';
import ChatIcon from '@/assets/icons/roundedChatDotIcon.svg?react';

// Types and Redux
import { SimpleStatement, Statement, NotificationType } from '@freedi/shared-types';
import { useSelector } from 'react-redux';
import { inAppNotificationsSelector } from '@/redux/notificationsSlice/notificationsSlice';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { statementSubsSelector } from '@/redux/statements/statementsSlice';
import { markStatementNotificationsAsReadDB } from '@/controllers/db/inAppNotifications/db_inAppNotifications';
import UnreadBadge from '@/view/components/unreadBadge/UnreadBadge';
import { useTranslation } from '@/controllers/hooks/useTranslation';

interface Props {
	statement: Statement | SimpleStatement;
	onlyCircle?: boolean;
	useLink?: boolean;
	asButton?: boolean;
	/** Show message count even when there are no unread notifications */
	showMessageCount?: boolean;
}

/**
 * StatementChatMore - Enhanced chat bubble for option cards
 *
 * Displays a prominent chat icon with:
 * - Total message count (always visible when messages exist)
 * - Unread notification badge (overlaid when there are unread messages)
 *
 * UX improvements:
 * - Larger touch target (44px minimum) for accessibility
 * - Visual container with border for better visibility
 * - Color-coded states (empty, has messages, has unread)
 * - Hover/active states for interactivity feedback
 */
const StatementChatMore: FC<Props> = ({
	statement,
	onlyCircle,
	useLink = true,
	asButton = true,
	showMessageCount = true,
}) => {
	const navigate = useNavigate();
	const { t } = useTranslation();

	// Redux store
	const creator = useSelector(creatorSelector);

	// Get sub-statements from Redux store for accurate count
	const subStatements = useSelector(statementSubsSelector(statement.statementId));

	// Get total sub-statements count - prioritize Redux store count, fallback to statement field
	const totalMessages = useMemo(() => {
		// Use Redux store count if available (more accurate)
		if (subStatements && subStatements.length > 0) {
			return subStatements.length;
		}

		// Fallback to totalSubStatements field from the statement
		if ('totalSubStatements' in statement && typeof statement.totalSubStatements === 'number') {
			return statement.totalSubStatements;
		}

		return 0;
	}, [subStatements, statement]);

	// Filter for UNREAD notifications only (with fallback for missing field)
	const unreadNotificationsList: NotificationType[] = useSelector(
		inAppNotificationsSelector
	).filter(
		(n) =>
			n.creatorId !== creator?.uid &&
			n.parentId === statement.statementId &&
			(!n.read || n.read === undefined) // Treat missing field as unread for backward compatibility
	);

	const unreadCount = unreadNotificationsList.length;
	// Consider has messages if either we have total count or unread notifications
	const hasMessages = totalMessages > 0 || unreadCount > 0;
	const hasUnread = unreadCount > 0;
	// Display count: show total if available, otherwise show unread as indicator
	const displayCount = totalMessages > 0 ? totalMessages : (unreadCount > 0 ? unreadCount : 0);

	const handleClick = async () => {
		if (useLink) {
			// Mark notifications as read when navigating to chat
			if (hasUnread) {
				await markStatementNotificationsAsReadDB(statement.statementId);
			}

			navigate(`/statement/${statement.statementId}/chat`, {
				state: { from: window.location.pathname },
			});
		}
	};

	// Build accessible label
	const ariaLabel = useMemo(() => {
		const parts: string[] = [];

		if (displayCount > 0) {
			parts.push(`${displayCount} ${displayCount === 1 ? t('message') : t('messages')}`);
		} else {
			parts.push(t('No messages'));
		}

		if (hasUnread) {
			parts.push(`${unreadCount} ${t('unread')}`);
		}

		parts.push(t('Click to open discussion'));

		return parts.join('. ');
	}, [displayCount, hasUnread, unreadCount, t]);

	// Determine container class based on state
	const containerClass = useMemo(() => {
		const classes = [styles.chatContainer];

		if (hasMessages) {
			classes.push(styles['chatContainer--hasMessages']);
		} else {
			classes.push(styles['chatContainer--empty']);
		}

		return classes.join(' ');
	}, [hasMessages]);

	const content = (
		<div className={containerClass}>
			<div className={styles.icon}>
				{/* Unread badge - positioned absolutely over the icon */}
				{hasUnread && (
					<UnreadBadge
						count={unreadCount}
						position="absolute"
						size="small"
						ariaLabel={`${unreadCount} ${t('unread')} ${unreadCount === 1 ? t('response') : t('responses')}`}
					/>
				)}
				{!onlyCircle && <ChatIcon />}
			</div>

			{/* Message count - always visible when showMessageCount is true and there are messages */}
			{showMessageCount && displayCount > 0 && (
				<span className={styles.messageCount} aria-hidden="true">
					{displayCount}
				</span>
			)}
		</div>
	);

	return asButton ? (
		<button
			className={styles.statementChatMore}
			aria-label={ariaLabel}
			onClick={handleClick}
			type="button"
		>
			{content}
		</button>
	) : (
		<button
			type="button"
			className={styles.statementChatMore}
			onClick={handleClick}
			aria-label={ariaLabel}
		>
			{content}
		</button>
	);
};

export default StatementChatMore;
